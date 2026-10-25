import { expect } from 'vitest';
import {
  type Actor,
  type Command,
  type EngineContext,
  type GameConfigInput,
  type GameState,
  GameConfigSchema,
  applyCommand,
  createGame,
} from '@/game';

/** Deterministic PRNG so tests replay identically. */
export function seeded(seed = 42): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CATS = ['tech', 'latam'] as const;

export function questionPool(perCategory = 10, categories: readonly string[] = CATS) {
  return categories.flatMap((c) =>
    Array.from({ length: perCategory }, (_, i) => ({ id: `${c}-${i}`, categoryId: c, answer: i % 4 })),
  );
}

export const T0 = 1_000_000;

export interface Table {
  state: GameState;
  now: number;
  random: () => number;
}

export function newGame(
  config: Partial<GameConfigInput> = {},
  opts: { players?: number; teams?: { id: string; name: string; members: number[] }[]; perCategory?: number; seed?: number } = {},
): Table {
  const players = Array.from({ length: opts.players ?? 3 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Jugador ${i + 1}`,
    teamId: opts.teams?.find((t) => t.members.includes(i + 1))?.id ?? null,
  }));
  const random = seeded(opts.seed ?? 7);
  const result = createGame(
    {
      config: GameConfigSchema.parse({ categories: [...CATS], ...config }),
      players,
      teams: (opts.teams ?? []).map(({ id, name }) => ({ id, name })),
      questions: questionPool(opts.perCategory ?? 10),
    },
    { now: T0, random },
  );
  if (!result.ok) throw new Error(result.error);
  return { state: result.state, now: T0, random };
}

export const as = (playerId: string): Actor => ({ playerId, role: 'player' });
export const host: Actor = { playerId: 'p1', role: 'host' };
export const system: Actor = { playerId: null, role: 'system' };

export function ctxOf(t: Table): EngineContext {
  return { now: t.now, random: t.random };
}

/** Applies a command that must succeed, at the table's current time. */
export function act(t: Table, actor: Actor, command: Command) {
  const result = applyCommand(t.state, actor, command, ctxOf(t));
  if (!result.ok) throw new Error(`${command.type} failed: ${result.error}`);
  t.state = result.state;
  return result.events;
}

/** Applies a command that must fail with `error`, leaving the state untouched. */
export function reject(t: Table, actor: Actor, command: Command, error: string) {
  const result = applyCommand(t.state, actor, command, ctxOf(t));
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBe(error);
}

export function advanceTo(t: Table, at: number) {
  t.now = at;
}

/** Moves the clock past the current phase deadline and ticks. */
export function tickThrough(t: Table) {
  t.now = Math.max(t.now, (t.state.phaseDeadline ?? t.now) + 300);
  return act(t, system, { type: 'tick' });
}

/** Spins and lets the wheel land, forcing a category segment (not the crown). */
export function spinToQuestion(t: Table) {
  const spinner = t.state.spinnerId!;
  const original = t.random;
  t.random = () => 0; // segment 0 = first category
  act(t, as(spinner), { type: 'spin' });
  t.random = original;
  tickThrough(t);
  expect(t.state.phase).toBe('question');
  return t.state.current!;
}

/** A function, so TypeScript does not keep a narrowed `phase` across commands that mutate `t`. */
export function isOver(t: Table): boolean {
  return t.state.phase === 'finished';
}

export function correctChoice(t: Table): number {
  return t.state.current!.answer;
}

export function wrongChoice(t: Table): number {
  return (t.state.current!.answer + 1) % 4;
}
