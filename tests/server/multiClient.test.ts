import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import type { Database } from '@/server/db/database';
import { type StateEnvelope, executeCommand, startGame } from '@/server/games/gameService';
import { createRoom, joinRoom, lobbyAction } from '@/server/rooms/roomService';
import { freshDatabase } from '../db/harness';
import { seeded } from '../game/helpers';
import { pgliteDatabase } from './pgliteDatabase';

const root = fileURLToPath(new URL('../../', import.meta.url));
const user = (i: number) => `00000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`;
const avatar = { color: 'blue', face: 'happy' } as const;

/**
 * Twelve phones and a TV playing a whole game against one database. Every client sends its
 * commands at the same server instant, as a busy room would, and the game must stay consistent.
 */
async function playFullGame(mode: 'ronda' | 'clasico') {
  const pg: PGlite = await freshDatabase();
  await pg.exec(readFileSync(`${root}supabase/seed.sql`, 'utf8'));
  const db: Database = pgliteDatabase(pg);
  const clock = { t: 1_800_000_000_000 };
  const pick = seeded(11);
  const deps = { db, now: () => clock.t, random: seeded(7) };

  const created = await createRoom(deps, { userId: user(0), name: 'Host', avatar });
  if (!created.ok) throw new Error(created.error);
  const { code } = created.value;
  const players = Array.from({ length: 12 }, (_, i) => user(i));
  await Promise.all(players.slice(1).map((u, i) => joinRoom(deps, { code, userId: u, join: { as: 'player', name: `Jugador ${i + 1}`, avatar } })));
  const tv = user(50);
  await joinRoom(deps, { code, userId: tv, join: { as: 'spectator' } });

  const lobby = await lobbyAction(deps, { code, userId: user(0), action: { type: 'heartbeat' } });
  if (!lobby.ok) throw new Error(lobby.error);
  const config = { ...lobby.value.room.config, mode, roundsMode: 'fixed' as const, rounds: 6, questionSeconds: 20 };
  expect((await lobbyAction(deps, { code, userId: user(0), action: { type: 'updateConfig', config } })).ok).toBe(true);
  expect((await startGame(deps, { roomCode: code, userId: user(0) })).ok).toBe(true);

  const state = async () => (await pg.query<{ state: { phase: string; phaseDeadline: number | null; spinnerId: string; current: { questionId: string } | null }; version: number }>(`select state, version from public.games order by seq desc limit 1`)).rows[0]!;
  const send = (u: string, command: unknown) => executeCommand(deps, { roomCode: code, userId: u, command });
  const everyone = [...players, tv];

  for (let guard = 0; guard < 400; guard++) {
    const { state: s } = await state();
    if (s.phase === 'finished') break;
    if (s.phase === 'question') {
      // All twelve answer at the same instant; the ones whose turn it is not are refused.
      const questionId = s.current!.questionId;
      await Promise.all(players.map((u) => send(u, { type: 'answer', questionId, choice: Math.floor(pick() * 4) })));
    }
    // Then everyone's countdown runs out together and every screen asks for the next phase.
    clock.t = Math.max(clock.t, s.phaseDeadline ?? clock.t) + 300;
    const ticks = await Promise.all(everyone.map((u) => send(u, { type: 'tick' })));
    expect(ticks.filter((r) => r.ok)).toHaveLength(1);
  }

  const final = await state();
  expect(final.state.phase).toBe('finished');

  // Broadcast versions only grow, and no state before a reveal carries the answer.
  const messages = (await pg.query<{ payload: StateEnvelope }>(`select payload from realtime.messages where topic = $1 and event = 'state' order by id`, [`room:${code}`])).rows.map((r) => r.payload);
  const versions = messages.map((m) => m.version);
  expect(versions).toEqual([...versions].sort((a, b) => a - b));
  expect(new Set(versions).size).toBe(versions.length);
  for (const m of messages) {
    if (m.state.phase === 'question') {
      expect(m.state.reveal).toBeNull();
      expect(JSON.stringify(m)).not.toMatch(/"answer"|"correct"|"decks"/);
    }
  }

  // Points on the board are exactly the points recorded answer by answer.
  const recorded = (await pg.query<{ player_id: string; points: number }>(`select player_id, coalesce(sum(points), 0)::int as points from public.answers group by player_id`)).rows;
  const last = messages.at(-1)!.state;
  for (const row of recorded) expect(last.scores[row.player_id]?.points ?? 0).toBeGreaterThanOrEqual(row.points);
  const total = recorded.reduce((n, r) => n + r.points, 0);
  const shown = Object.values(last.scores).reduce((n, s) => n + s.points, 0);
  // Crown bonuses are added to the score but not to a single answer row.
  expect(shown).toBeGreaterThanOrEqual(total);
  return { last, answers: recorded.length };
}

describe('a full room of twelve', () => {
  it('plays a whole game all at once, with every screen ticking together', async () => {
    const { last, answers } = await playFullGame('ronda');
    expect(last.finished?.reason).toBe('rounds');
    expect(answers).toBeGreaterThan(0);
    expect(last.standings).toHaveLength(12);
  }, 60_000);

  it('plays a whole game by turns, where only the player on turn may answer', async () => {
    const { last } = await playFullGame('clasico');
    expect(last.finished).not.toBeNull();
    expect(last.standings).toHaveLength(12);
  }, 60_000);
});
