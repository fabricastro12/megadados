import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '@/server/db/database';
import { executeCommand, startGame } from '@/server/games/gameService';
import { createRoom, getLobby, joinRoom, lobbyAction } from '@/server/rooms/roomService';
import { U, freshDatabase } from '../db/harness';
import { seeded } from '../game/helpers';
import { pgliteDatabase } from './pgliteDatabase';

const root = fileURLToPath(new URL('../../', import.meta.url));
const VALE = '00000000-0000-4000-8000-000000000006';
const avatar = { color: 'blue', face: 'happy' } as const;

let pg: PGlite;
let db: Database;
let clock: { t: number };
let deps: { db: Database; now: () => number; random: () => number };

beforeEach(async () => {
  pg = await freshDatabase();
  await pg.exec(readFileSync(`${root}supabase/seed.sql`, 'utf8'));
  db = pgliteDatabase(pg);
  clock = { t: Date.now() };
  deps = { db, now: () => clock.t, random: seeded(5) };
});

async function hostRoom() {
  const created = await createRoom(deps, { userId: U.host, name: 'Nico', avatar });
  if (!created.ok) throw new Error(created.error);
  return created.value;
}

const join = (code: string, userId: string, name: string) => joinRoom(deps, { code, userId, join: { as: 'player', name, avatar } });
const act = (code: string, userId: string, action: Parameters<typeof lobbyAction>[1]['action']) => lobbyAction(deps, { code, userId, action });

describe('creating and joining a room', () => {
  it('creates a room with a 4-digit PIN, the host seat and the active categories', async () => {
    const { code, pin, seatId } = await hostRoom();
    expect(code).toMatch(/^[A-Z0-9]{5}$/);
    expect(pin).toMatch(/^\d{4}$/);
    const lobby = await getLobby(deps, { code, userId: U.host });
    expect(lobby.ok && lobby.value.seatId).toBe(seatId);
    expect(lobby.ok && lobby.value.players.map((p) => p.role)).toEqual(['host']);
    expect(lobby.ok && lobby.value.room.config.categories.length).toBeGreaterThanOrEqual(2);
    const stored = (await pg.query<{ host_pin_hash: string }>(`select host_pin_hash from public.rooms where code = $1`, [code])).rows[0]!;
    expect(stored.host_pin_hash).not.toContain(pin);
  });

  it('joining again with the same session returns the same seat (reconnection)', async () => {
    const { code } = await hostRoom();
    const first = await join(code, U.player, 'Caro');
    const again = await join(code, U.player, 'Caro otra vez');
    expect(first.ok && again.ok && first.value.seatId === again.value.seatId).toBe(true);
    const lobby = await getLobby(deps, { code, userId: U.player });
    expect(lobby.ok && lobby.value.players.map((p) => p.name)).toEqual(['Nico', 'Caro']);
  });

  it('broadcasts the lobby to the room topic on every change', async () => {
    const { code } = await hostRoom();
    await join(code, U.player, 'Caro');
    const rows = (await pg.query<{ event: string; topic: string }>(`select event, topic from realtime.messages order by id desc limit 1`)).rows;
    expect(rows[0]).toEqual({ event: 'lobby', topic: `room:${code}` });
  });

  it('rejects unknown codes and people who are not in the room', async () => {
    expect(await join('ZZZZZ', U.player, 'Caro')).toMatchObject({ ok: false, error: 'no_room' });
    const { code } = await hostRoom();
    expect(await getLobby(deps, { code, userId: U.player })).toMatchObject({ ok: false, error: 'not_in_room' });
  });

});

describe('lobby settings', () => {
  it('only the host changes the rules', async () => {
    const { code } = await hostRoom();
    await join(code, U.player, 'Caro');
    const lobby = await getLobby(deps, { code, userId: U.host });
    if (!lobby.ok) throw new Error(lobby.error);
    const config = { ...lobby.value.room.config, questionSeconds: 30 };
    expect(await act(code, U.player, { type: 'updateConfig', config })).toMatchObject({ ok: false, error: 'not_host' });
    const updated = await act(code, U.host, { type: 'updateConfig', config });
    expect(updated.ok && updated.value.room.config.questionSeconds).toBe(30);
  });

  it('turning teams on creates the teams and spreads the players evenly', async () => {
    const { code } = await hostRoom();
    await join(code, U.player, 'Caro');
    await join(code, VALE, 'Vale');
    const lobby = await getLobby(deps, { code, userId: U.host });
    if (!lobby.ok) throw new Error(lobby.error);
    const config = { ...lobby.value.room.config, teams: { ...lobby.value.room.config.teams, enabled: true, count: 2 } };
    const updated = await act(code, U.host, { type: 'updateConfig', config });
    if (!updated.ok) throw new Error(updated.error);
    expect(updated.value.teams).toHaveLength(2);
    const sizes = updated.value.teams.map((t) => updated.value.players.filter((p) => p.teamId === t.id).length).sort();
    expect(sizes).toEqual([1, 2]);

    const off = await act(code, U.host, { type: 'updateConfig', config: { ...config, teams: { ...config.teams, enabled: false } } });
    expect(off.ok && off.value.teams).toEqual([]);
  });

  it('rejects categories that do not exist', async () => {
    const { code } = await hostRoom();
    const lobby = await getLobby(deps, { code, userId: U.host });
    if (!lobby.ok) throw new Error(lobby.error);
    const config = { ...lobby.value.room.config, categories: ['00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000bb'] };
    expect(await act(code, U.host, { type: 'updateConfig', config })).toMatchObject({ ok: false, error: 'invalid_category' });
  });
});

describe('taking over as host', () => {
  it('needs the PIN while the host is still around', async () => {
    const { code, pin } = await hostRoom();
    await join(code, U.player, 'Caro');
    expect(await act(code, U.player, { type: 'claimHost' })).toMatchObject({ ok: false, error: 'host_present' });
    expect(await act(code, U.player, { type: 'claimHost', pin: pin === '0000' ? '1111' : '0000' })).toMatchObject({ ok: false, error: 'wrong_pin' });
    const claimed = await act(code, U.player, { type: 'claimHost', pin });
    expect(claimed.ok && claimed.value.players.map((p) => [p.name, p.role])).toEqual([
      ['Nico', 'player'],
      ['Caro', 'host'],
    ]);
  });

  it('works without the PIN once the host stopped sending heartbeats', async () => {
    const { code } = await hostRoom();
    await join(code, U.player, 'Caro');
    clock.t += 60_000;
    const claimed = await act(code, U.player, { type: 'claimHost' });
    expect(claimed.ok && claimed.value.room.hostPlayerId).toBe(claimed.ok && claimed.value.players.find((p) => p.name === 'Caro')!.id);
  });
});

describe('joining a game in progress', () => {
  it('adds a late player to the running game when allowed', async () => {
    const { code } = await hostRoom();
    await join(code, U.player, 'Caro');
    expect((await startGame(deps, { roomCode: code, userId: U.host })).ok).toBe(true);
    const vale = await join(code, VALE, 'Vale');
    expect(vale.ok).toBe(true);
    const state = (await pg.query<{ state: { players: { name: string }[] } }>(`select state from public.games order by seq desc limit 1`)).rows[0]!.state;
    expect(state.players.map((p) => p.name)).toEqual(['Nico', 'Caro', 'Vale']);
    // The newcomer can act in the game right away.
    expect((await executeCommand(deps, { roomCode: code, userId: VALE, command: { type: 'tick' } })).ok).toBe(false);
  });

  it('turns people away when late joining is off', async () => {
    const { code } = await hostRoom();
    const lobby = await getLobby(deps, { code, userId: U.host });
    if (!lobby.ok) throw new Error(lobby.error);
    await act(code, U.host, { type: 'updateConfig', config: { ...lobby.value.room.config, allowLateJoin: false } });
    expect((await startGame(deps, { roomCode: code, userId: U.host })).ok).toBe(true);
    expect(await join(code, VALE, 'Vale')).toMatchObject({ ok: false, error: 'room_closed' });
    // A screen can still join to watch.
    expect((await joinRoom(deps, { code, userId: U.spectator, join: { as: 'spectator' } })).ok).toBe(true);
  });
});
