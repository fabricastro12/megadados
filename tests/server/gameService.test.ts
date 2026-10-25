import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '@/server/db/database';
import { type StateEnvelope, cryptoRandom, executeCommand, loadSnapshot, startGame } from '@/server/games/gameService';
import { U, freshDatabase } from '../db/harness';
import { seeded } from '../game/helpers';
import { pgliteDatabase } from './pgliteDatabase';

const root = fileURLToPath(new URL('../../', import.meta.url));
const CODE = 'MXQ7K';
const VALE = '00000000-0000-4000-8000-000000000006';

let pg: PGlite;
let db: Database;
let clock: { t: number };
let deps: { db: Database; now: () => number; random: () => number };
let seats: Record<string, string>;

beforeEach(async () => {
  pg = await freshDatabase();
  await pg.exec(readFileSync(`${root}supabase/seed.sql`, 'utf8'));
  const cats = (await pg.query<{ id: string }>(`select id from public.categories where slug in ('tecnologia-ia', 'latinoamerica') order by sort_order`)).rows;
  const room = await pg.query<{ id: string }>(`insert into public.rooms (code, config) values ($1, $2::jsonb) returning id`, [
    CODE,
    JSON.stringify({ categories: cats.map((c) => c.id) }),
  ]);
  const rows = await pg.query<{ id: string; user_id: string }>(
    `insert into public.players (room_id, user_id, name, role, joined_at) values
       ($1, $2, 'Nico', 'host', now() - interval '3 min'), ($1, $3, 'Caro', 'player', now() - interval '2 min'),
       ($1, $4, 'Vale', 'player', now() - interval '1 min'), ($1, $5, 'Pantalla', 'spectator', now())
     returning id, user_id`,
    [room.rows[0]!.id, U.host, U.player, VALE, U.spectator],
  );
  seats = Object.fromEntries(rows.rows.map((r) => [r.user_id, r.id]));
  db = pgliteDatabase(pg);
  clock = { t: 1_800_000_000_000 };
  deps = { db, now: () => clock.t, random: seeded(3) };
});

async function lastBroadcast(topic = `room:${CODE}`): Promise<StateEnvelope> {
  const rows = (await pg.query<{ payload: StateEnvelope }>(`select payload from realtime.messages where topic = $1 order by id desc limit 1`, [topic])).rows;
  return rows[0]!.payload;
}

async function gameState() {
  return (await pg.query<{ state: { phaseDeadline: number; spinnerId: string; current: { questionId: string; answer: number } | null }; version: number }>(
    `select state, version from public.games order by seq desc limit 1`,
  )).rows[0]!;
}

const run = (userId: string, command: unknown) => executeCommand(deps, { roomCode: CODE, userId, command });

/** Starts a game and gets to the first question. */
async function toFirstQuestion() {
  expect((await startGame(deps, { roomCode: CODE, userId: U.host })).ok).toBe(true);
  deps.random = () => 0; // land on the first category
  expect((await run(U.host, { type: 'spin' })).ok).toBe(true);
  clock.t = (await gameState()).state.phaseDeadline;
  expect((await run(U.spectator, { type: 'tick' })).ok).toBe(true);
  deps.random = seeded(3);
  return (await gameState()).state.current!;
}

describe('starting a game', () => {
  it('works with the real CSPRNG, which stays in [0, 1)', async () => {
    const samples = Array.from({ length: 2000 }, cryptoRandom);
    expect(samples.every((x) => x >= 0 && x < 1)).toBe(true);
    const result = await startGame({ db, now: deps.now }, { roomCode: CODE, userId: U.host });
    expect(result.ok).toBe(true);
  });

  it('only the host can start', async () => {
    const result = await startGame(deps, { roomCode: CODE, userId: U.player });
    expect(result).toMatchObject({ ok: false, error: 'not_host', status: 403 });
  });

  it('builds the decks from the bank, marks the room as playing and broadcasts the first state', async () => {
    const result = await startGame(deps, { roomCode: CODE, userId: U.host });
    expect(result).toEqual({ ok: true, value: { version: 1 } });
    const { state } = await gameState();
    expect(state.spinnerId).toBe(seats[U.host]);
    const status = (await pg.query<{ status: string }>(`select status from public.rooms`)).rows[0]!.status;
    expect(status).toBe('playing');
    const envelope = await lastBroadcast();
    expect(envelope.version).toBe(1);
    expect(envelope.state.players.map((p) => p.name)).toEqual(['Nico', 'Caro', 'Vale']);
  });

  it('refuses to start twice', async () => {
    await startGame(deps, { roomCode: CODE, userId: U.host });
    expect(await startGame(deps, { roomCode: CODE, userId: U.host })).toMatchObject({ ok: false, error: 'already_playing' });
  });
});

describe('commands', () => {
  it('rejects strangers, malformed commands and server-only commands', async () => {
    await startGame(deps, { roomCode: CODE, userId: U.host });
    expect(await run(U.stranger, { type: 'tick' })).toMatchObject({ ok: false, error: 'not_in_room', status: 403 });
    expect(await run(U.host, { type: 'answer', choice: 7 })).toMatchObject({ ok: false, error: 'invalid_command', status: 400 });
    expect(await run(U.host, { type: 'addPlayer', player: { id: 'x', name: 'X', teamId: null } })).toMatchObject({
      ok: false,
      error: 'invalid_command',
    });
  });

  it('broadcasts the question text without its answer, and records it as asked', async () => {
    const q = await toFirstQuestion();
    const envelope = await lastBroadcast();
    expect(envelope.question!.id).toBe(q.questionId);
    expect(envelope.question!.options).toHaveLength(4);
    expect(envelope.question!.explanation).toBeNull();
    const all = (await pg.query<{ payload: unknown }>(`select payload from realtime.messages`)).rows;
    for (const { payload } of all) {
      expect(JSON.stringify(payload)).not.toMatch(/"(answer|correct_index|decks)"/);
    }
    const asked = (await pg.query(`select * from public.game_questions where question_id = $1`, [q.questionId])).rows;
    expect(asked).toHaveLength(1);
  });

  it('two answers from the same player at the same instant: one counts, one is refused', async () => {
    const q = await toFirstQuestion();
    const [a, b] = await Promise.all([
      run(U.player, { type: 'answer', questionId: q.questionId, choice: 0 }),
      run(U.player, { type: 'answer', questionId: q.questionId, choice: 1 }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a, b].find((r) => !r.ok)).toMatchObject({ error: 'already_answered' });
    const rows = (await pg.query(`select * from public.answers`)).rows;
    expect(rows).toHaveLength(1);
  });

  it('ticks racing from several clients advance the game exactly once', async () => {
    await startGame(deps, { roomCode: CODE, userId: U.host });
    await run(U.host, { type: 'spin' });
    clock.t = (await gameState()).state.phaseDeadline;
    const results = await Promise.all([run(U.host, { type: 'tick' }), run(U.player, { type: 'tick' }), run(U.spectator, { type: 'tick' })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.error === 'deadline_not_reached')).toBe(true);
    expect((await gameState()).version).toBe(3);
  });

  it('rejects an answer that arrives after the deadline, by the server clock', async () => {
    const q = await toFirstQuestion();
    clock.t += 60_000;
    expect(await run(U.player, { type: 'answer', questionId: q.questionId, choice: 0 })).toMatchObject({ ok: false, error: 'late' });
  });

  it('at the reveal, settles every answer and sends the explanation', async () => {
    const q = await toFirstQuestion();
    const right = q.answer;
    await run(U.host, { type: 'answer', questionId: q.questionId, choice: right });
    await run(U.player, { type: 'answer', questionId: q.questionId, choice: (right + 1) % 4 });
    await run(VALE, { type: 'answer', questionId: q.questionId, choice: right });
    const rows = (await pg.query<{ player_id: string; is_correct: boolean; points: number }>(
      `select player_id, is_correct, points from public.answers order by received_at, player_id`,
    )).rows;
    expect(rows.find((r) => r.player_id === seats[U.player])).toMatchObject({ is_correct: false, points: 0 });
    expect(rows.find((r) => r.player_id === seats[U.host])!.points).toBeGreaterThan(100);
    const envelope = await lastBroadcast();
    expect(envelope.state.reveal!.correct).toBe(right);
    expect(envelope.state.phase).toBe('reveal');
  });

  it('tells the screens who answered but not what', async () => {
    const q = await toFirstQuestion();
    await run(U.player, { type: 'answer', questionId: q.questionId, choice: 2 });
    const screens = await lastBroadcast(`room:${CODE}:screens`);
    expect(screens).toEqual({ ownerId: seats[U.player], playerId: seats[U.player] });
  });

  it('host kicks reach the players table', async () => {
    await startGame(deps, { roomCode: CODE, userId: U.host });
    expect((await run(U.host, { type: 'kick', playerId: seats[VALE] })).ok).toBe(true);
    const kicked = (await pg.query<{ kicked_at: string | null }>(`select kicked_at from public.players where id = $1`, [seats[VALE]])).rows[0]!;
    expect(kicked.kicked_at).not.toBeNull();
    expect(await run(VALE, { type: 'tick' })).toMatchObject({ ok: false, error: 'not_in_room' });
  });
});

describe('reconnecting and rematches', () => {
  it('a snapshot restores the same seat with its private view', async () => {
    const q = await toFirstQuestion();
    await run(U.player, { type: 'useLifeline', lifeline: 'fiftyFifty' });
    const snap = await loadSnapshot(deps, { roomCode: CODE, userId: U.player });
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    expect(snap.value.seatId).toBe(seats[U.player]);
    expect(snap.value.question!.id).toBe(q.questionId);
    expect(snap.value.you!.removedOptions).toHaveLength(2);
    expect(snap.value.you!.removedOptions).not.toContain(q.answer);
    const tv = await loadSnapshot(deps, { roomCode: CODE, userId: U.spectator });
    expect(tv.ok && tv.value.you).toBeNull();
  });

  it('after a game ends the host can start a rematch in the same room', async () => {
    await startGame(deps, { roomCode: CODE, userId: U.host });
    await run(U.host, { type: 'end' });
    expect((await pg.query<{ status: string }>(`select status from public.rooms`)).rows[0]!.status).toBe('finished');
    expect((await startGame(deps, { roomCode: CODE, userId: U.host })).ok).toBe(true);
    const seqs = (await pg.query<{ seq: number }>(`select seq from public.games order by seq`)).rows.map((r) => r.seq);
    expect(seqs).toEqual([1, 2]);
    // Versions restart, so clients tell the rematch apart by its game number.
    expect(await lastBroadcast()).toMatchObject({ game: 2, version: 1 });
  });
});

describe('classic team play', () => {
  /** Nico alone against Caro and Vale, who vote on their answers. */
  async function teamVoteGame() {
    const room = (await pg.query<{ id: string; config: Record<string, unknown> }>(`select id, config from public.rooms`)).rows[0]!;
    const teams = (
      await pg.query<{ id: string }>(`insert into public.teams (room_id, name, sort_order) values ($1, 'Cóndores', 0), ($1, 'Llamas', 1) returning id`, [room.id])
    ).rows;
    await pg.query(`update public.players set team_id = $2 where id = $1`, [seats[U.host], teams[0]!.id]);
    await pg.query(`update public.players set team_id = $2 where id = any($1)`, [[seats[U.player], seats[VALE]], teams[1]!.id]);
    const config = { ...room.config, mode: 'clasico', teams: { enabled: true, count: 2, assignment: 'manual', answerMode: 'vote' } };
    await pg.query(`update public.rooms set config = $2::text::jsonb where id = $1`, [room.id, JSON.stringify(config)]);
    expect((await startGame(deps, { roomCode: CODE, userId: U.host })).ok).toBe(true);
    return teams;
  }

  it('records team votes and settles the answer once the whole team voted', async () => {
    const teams = await teamVoteGame();
    deps.random = () => 0; // land on the first category every time
    const owner = () => gameState().then((g) => g.state);
    let state = await owner();
    expect(state.spinnerId).toBe(seats[U.host]);
    await run(U.host, { type: 'spin' });
    clock.t = (await gameState()).state.phaseDeadline;
    await run(U.spectator, { type: 'tick' });
    const q = (await gameState()).state.current!;
    // Cóndores (Nico alone) vote wrong, which settles their answer and ends the turn.
    expect(await run(U.host, { type: 'answer', questionId: q.questionId, choice: 0 })).toMatchObject({ ok: false, error: 'use_vote' });
    expect((await run(U.host, { type: 'vote', questionId: q.questionId, choice: (q.answer + 1) % 4 })).ok).toBe(true);
    clock.t = (await gameState()).state.phaseDeadline;
    await run(U.spectator, { type: 'tick' });
    state = await owner();
    expect(state.spinnerId).toBe(seats[U.player]);

    await run(U.player, { type: 'spin' });
    clock.t = (await gameState()).state.phaseDeadline;
    await run(U.spectator, { type: 'tick' });
    const q2 = (await gameState()).state.current!;
    expect((await run(U.player, { type: 'vote', questionId: q2.questionId, choice: q2.answer })).ok).toBe(true);
    expect(await lastBroadcast()).toMatchObject({ state: { phase: 'question', question: { votedBy: [seats[U.player]] } } });
    expect((await run(VALE, { type: 'vote', questionId: q2.questionId, choice: q2.answer })).ok).toBe(true);
    const reveal = (await lastBroadcast()).state;
    expect(reveal.phase).toBe('reveal');
    expect(reveal.reveal!.results[teams[1]!.id]).toMatchObject({ correct: true });

    const votes = (await pg.query<{ kind: string; choice: number }>(`select kind, choice from public.votes order by received_at, player_id`)).rows;
    expect(votes).toHaveLength(3);
    expect(votes.every((v) => v.kind === 'team')).toBe(true);
  });
});
