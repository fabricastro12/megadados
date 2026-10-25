import { createHash, randomInt } from 'node:crypto';
import { GameConfigSchema, type GameConfig } from '@/game/config';
import {
  type Avatar,
  type LobbyAction,
  type LobbySnapshot,
  HOST_STALE_MS,
  TEAM_PRESETS,
} from '@/rooms/model';
import type { SqlExecutor } from '../db/database';
import { gameRepository as games } from '../games/gameRepository';
import { type ServiceDeps, type ServiceResult, applyInTransaction, cryptoRandom, fail, topics } from '../games/gameService';

const hashPin = (roomId: string, pin: string) => createHash('sha256').update(`${roomId}:${pin}`).digest('hex');

interface SeatFull {
  id: string;
  role: 'host' | 'player' | 'spectator';
  team_id: string | null;
  last_seen_at: Date | string;
}

async function seatOf(tx: SqlExecutor, roomId: string, userId: string): Promise<SeatFull | null> {
  const rows = await tx.query<SeatFull>(
    `select id, role, team_id, last_seen_at from public.players where room_id = $1 and user_id = $2 and kicked_at is null`,
    [roomId, userId],
  );
  return rows[0] ?? null;
}

async function activeCategories(tx: SqlExecutor) {
  return tx.query<{ id: string; slug: string; name: string; color: string; icon: string }>(
    `select id, slug, name, color, icon from public.categories where is_active order by sort_order, name`,
  );
}

export async function lobbySnapshot(tx: SqlExecutor, roomId: string): Promise<LobbySnapshot> {
  const room = (
    await tx.query<{ code: string; status: LobbySnapshot['room']['status']; config: unknown; host_player_id: string | null }>(
      `select code, status, config, host_player_id from public.rooms where id = $1`,
      [roomId],
    )
  )[0]!;
  const players = await tx.query<{ id: string; name: string; avatar: Avatar; role: SeatFull['role']; team_id: string | null }>(
    `select id, name, avatar, role, team_id from public.players where room_id = $1 and kicked_at is null order by joined_at, id`,
    [roomId],
  );
  const teams = await tx.query<{ id: string; name: string; color: string }>(
    `select id, name, color from public.teams where room_id = $1 order by sort_order, name`,
    [roomId],
  );
  return {
    room: { code: room.code, status: room.status, config: GameConfigSchema.parse(room.config), hostPlayerId: room.host_player_id },
    players: players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, role: p.role, teamId: p.team_id })),
    teams,
    categories: await activeCategories(tx),
  };
}

async function broadcastLobby(tx: SqlExecutor, roomId: string, code: string): Promise<LobbySnapshot> {
  const snapshot = await lobbySnapshot(tx, roomId);
  await games.broadcast(tx, topics.room(code), 'lobby', snapshot);
  return snapshot;
}

/** Keeps exactly `count` team rows while teams are on, and none while they are off. */
async function syncTeams(tx: SqlExecutor, roomId: string, config: GameConfig): Promise<void> {
  const existing = await tx.query<{ id: string; sort_order: number }>(
    `select id, sort_order from public.teams where room_id = $1 order by sort_order`,
    [roomId],
  );
  const wanted = config.teams.enabled ? config.teams.count : 0;
  for (const extra of existing.slice(wanted)) await tx.query(`delete from public.teams where id = $1`, [extra.id]);
  for (let i = existing.length; i < wanted; i++) {
    const preset = TEAM_PRESETS[i % TEAM_PRESETS.length]!;
    await tx.query(`insert into public.teams (room_id, name, color, sort_order) values ($1, $2, $3, $4)`, [roomId, preset.name, preset.color, i]);
  }
  if (wanted > 0) await fillTeams(tx, roomId, false);
}

/** Puts players without a team into the smallest team (or reshuffles everyone). */
async function fillTeams(tx: SqlExecutor, roomId: string, reshuffle: boolean): Promise<void> {
  const teams = await tx.query<{ id: string }>(`select id from public.teams where room_id = $1 order by sort_order`, [roomId]);
  if (teams.length === 0) return;
  const players = await tx.query<{ id: string; team_id: string | null }>(
    `select id, team_id from public.players where room_id = $1 and kicked_at is null and role <> 'spectator' order by joined_at, id`,
    [roomId],
  );
  const sizes = new Map(teams.map((t) => [t.id, 0]));
  const pending: string[] = [];
  if (reshuffle) {
    const order = [...players];
    for (let i = order.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    pending.push(...order.map((p) => p.id));
  } else {
    for (const p of players) {
      if (p.team_id && sizes.has(p.team_id)) sizes.set(p.team_id, sizes.get(p.team_id)! + 1);
      else pending.push(p.id);
    }
  }
  for (const playerId of pending) {
    const smallest = [...sizes.entries()].sort((a, b) => a[1] - b[1])[0]![0];
    sizes.set(smallest, sizes.get(smallest)! + 1);
    await tx.query(`update public.players set team_id = $2 where id = $1`, [playerId, smallest]);
  }
}

export async function createRoom(
  deps: ServiceDeps,
  input: { userId: string; name: string; avatar: Avatar },
): Promise<ServiceResult<{ code: string; pin: string; seatId: string }>> {
  return deps.db.transaction(async (tx) => {
    const categories = await activeCategories(tx);
    const config = GameConfigSchema.parse({ categories: categories.slice(0, 8).map((c) => c.id) });
    const code = (await tx.query<{ code: string }>(`select public.generate_room_code() as code`))[0]!.code;
    const room = (await tx.query<{ id: string }>(`insert into public.rooms (code, config) values ($1, $2::text::jsonb) returning id`, [code, JSON.stringify(config)]))[0]!;
    const pin = String(randomInt(0, 10_000)).padStart(4, '0');
    const seat = (
      await tx.query<{ id: string }>(
        `insert into public.players (room_id, user_id, name, avatar, role) values ($1, $2, $3, $4::text::jsonb, 'host') returning id`,
        [room.id, input.userId, input.name, JSON.stringify(input.avatar)],
      )
    )[0]!;
    await tx.query(`update public.rooms set host_player_id = $2, host_pin_hash = $3 where id = $1`, [room.id, seat.id, hashPin(room.id, pin)]);
    return { ok: true, value: { code, pin, seatId: seat.id } };
  });
}

/** Takes a seat, or returns the one this session already has (that is how reconnection works). */
export async function joinRoom(
  deps: ServiceDeps,
  input: { code: string; userId: string; join: { as: 'player'; name: string; avatar: Avatar } | { as: 'spectator' } },
): Promise<ServiceResult<{ seatId: string; role: SeatFull['role'] }>> {
  return deps.db.transaction(async (tx) => {
    const room = await games.findRoom(tx, input.code, true);
    if (!room) return fail('no_room');
    const existing = await seatOf(tx, room.id, input.userId);
    if (existing) return { ok: true, value: { seatId: existing.id, role: existing.role } };
    const kicked = await tx.query(`select 1 from public.players where room_id = $1 and user_id = $2 and kicked_at is not null`, [room.id, input.userId]);
    if (kicked.length > 0) return fail('not_in_room');

    const config = GameConfigSchema.parse(room.config);
    if (input.join.as === 'player' && room.status === 'playing' && !config.allowLateJoin) return fail('room_closed');

    const join = input.join;
    const seat = (
      await tx.query<{ id: string }>(
        join.as === 'player'
          ? `insert into public.players (room_id, user_id, name, avatar, role) values ($1, $2, $3, $4::text::jsonb, 'player') returning id`
          : `insert into public.players (room_id, user_id, name, role) values ($1, $2, 'Pantalla', 'spectator') returning id`,
        join.as === 'player' ? [room.id, input.userId, join.name, JSON.stringify(join.avatar)] : [room.id, input.userId],
      )
    )[0]!;

    if (join.as === 'player') {
      if (config.teams.enabled) await fillTeams(tx, room.id, false);
      if (room.status === 'playing') {
        const teamId = (await seatOf(tx, room.id, input.userId))!.team_id;
        await applyInTransaction(
          tx,
          room,
          { playerId: null, role: 'system' },
          { type: 'addPlayer', player: { id: seat.id, name: join.name, teamId } },
          { now: (deps.now ?? Date.now)(), random: deps.random ?? cryptoRandom },
        );
      }
    }
    await broadcastLobby(tx, room.id, room.code);
    return { ok: true, value: { seatId: seat.id, role: join.as === 'player' ? 'player' : 'spectator' } };
  });
}

export async function getLobby(deps: ServiceDeps, input: { code: string; userId: string }): Promise<ServiceResult<LobbySnapshot & { seatId: string }>> {
  return deps.db.transaction(async (tx) => {
    const room = await games.findRoom(tx, input.code);
    if (!room) return fail('no_room');
    const seat = await seatOf(tx, room.id, input.userId);
    if (!seat) return fail('not_in_room');
    return { ok: true, value: { ...(await lobbySnapshot(tx, room.id)), seatId: seat.id } };
  });
}

const HOST_ONLY = new Set<LobbyAction['type']>(['updateConfig', 'shuffleTeams', 'renameTeam', 'kick']);

export async function lobbyAction(
  deps: ServiceDeps,
  input: { code: string; userId: string; action: LobbyAction },
): Promise<ServiceResult<LobbySnapshot>> {
  const now = deps.now ?? Date.now;
  return deps.db.transaction(async (tx) => {
    const room = await games.findRoom(tx, input.code, true);
    if (!room) return fail('no_room');
    const seat = await seatOf(tx, room.id, input.userId);
    if (!seat) return fail('not_in_room');
    const { action } = input;
    const isHost = seat.role === 'host';
    if (HOST_ONLY.has(action.type) && !isHost) return fail('not_host');
    const inLobby = room.status !== 'playing';

    switch (action.type) {
      case 'heartbeat':
        await games.touchSeat(tx, seat.id);
        return { ok: true, value: await lobbySnapshot(tx, room.id) };
      case 'updateProfile':
        if (seat.role === 'spectator') return fail('not_participant');
        await tx.query(`update public.players set name = $2, avatar = $3::text::jsonb, last_seen_at = now() where id = $1`, [
          seat.id,
          action.name,
          JSON.stringify(action.avatar),
        ]);
        break;
      case 'updateConfig': {
        if (!inLobby) return fail('already_playing');
        const known = new Set((await activeCategories(tx)).map((c) => c.id));
        if (!action.config.categories.every((c) => known.has(c))) return fail('invalid_category');
        await tx.query(`update public.rooms set config = $2::text::jsonb where id = $1`, [room.id, JSON.stringify(action.config)]);
        await syncTeams(tx, room.id, action.config);
        break;
      }
      case 'assignTeam': {
        if (!inLobby) return fail('already_playing');
        const config = GameConfigSchema.parse(room.config);
        const self = action.playerId === seat.id && config.teams.assignment === 'choose';
        if (!isHost && !self) return fail('not_host');
        const team = action.teamId
          ? await tx.query(`select 1 from public.teams where id = $1 and room_id = $2`, [action.teamId, room.id])
          : [{}];
        if (team.length === 0) return fail('invalid_command');
        await tx.query(`update public.players set team_id = $2 where id = $1 and room_id = $3`, [action.playerId, action.teamId, room.id]);
        break;
      }
      case 'shuffleTeams':
        if (!inLobby) return fail('already_playing');
        await fillTeams(tx, room.id, true);
        break;
      case 'renameTeam':
        await tx.query(`update public.teams set name = $2 where id = $1 and room_id = $3`, [action.teamId, action.name, room.id]);
        break;
      case 'kick': {
        if (action.playerId === seat.id) return fail('invalid_command');
        if (room.status === 'playing') {
          const result = await applyInTransaction(tx, room, { playerId: seat.id, role: 'host' }, { type: 'kick', playerId: action.playerId }, {
            now: now(),
            random: deps.random ?? cryptoRandom,
          });
          if (!result.ok && result.error !== 'unknown_player') return result;
        }
        await tx.query(`update public.players set kicked_at = now() where id = $1 and room_id = $2`, [action.playerId, room.id]);
        break;
      }
      case 'claimHost': {
        if (isHost) return { ok: true, value: await lobbySnapshot(tx, room.id) };
        if (seat.role === 'spectator') return fail('not_participant');
        const host = (
          await tx.query<{ host_pin_hash: string | null; host_player_id: string | null; last_seen_at: Date | string | null }>(
            `select r.host_pin_hash, r.host_player_id, p.last_seen_at
               from public.rooms r left join public.players p on p.id = r.host_player_id and p.kicked_at is null
              where r.id = $1`,
            [room.id],
          )
        )[0]!;
        const pinOk = !!action.pin && host.host_pin_hash === hashPin(room.id, action.pin);
        const hostGone = !host.last_seen_at || now() - new Date(host.last_seen_at).getTime() > HOST_STALE_MS;
        if (!pinOk && !hostGone) return fail(action.pin ? 'wrong_pin' : 'host_present');
        await tx.query(`update public.players set role = 'player' where room_id = $1 and role = 'host'`, [room.id]);
        await tx.query(`update public.players set role = 'host' where id = $1`, [seat.id]);
        await tx.query(`update public.rooms set host_player_id = $2 where id = $1`, [room.id, seat.id]);
        break;
      }
    }
    return { ok: true, value: await broadcastLobby(tx, room.id, room.code) };
  });
}
