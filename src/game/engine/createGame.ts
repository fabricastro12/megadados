import type { GameConfig } from '../config';
import { ownerIds, spinnerFor } from '../rules/owners';
import type { DeckCard, EngineContext, EngineResult, GameState, OwnerScore, TeamRef } from '../types';

export interface NewGameInput {
  config: GameConfig;
  players: { id: string; name: string; teamId: string | null }[];
  teams: { id: string; name: string }[];
  /** The playable pool, already filtered by active state and difficulty. */
  questions: { id: string; categoryId: string; answer: number }[];
}

export function emptyScore(): OwnerScore {
  return { points: 0, crowns: [], streak: 0, bestStreak: 0, correct: 0, answered: 0, fastestMs: null, usedLifelines: [], byCategory: {} };
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function createGame(input: NewGameInput, ctx: EngineContext): EngineResult {
  const { config } = input;
  const teams: TeamRef[] = config.teams.enabled
    ? input.teams.map((t) => ({ id: t.id, name: t.name, memberIds: input.players.filter((p) => p.teamId === t.id).map((p) => p.id) }))
    : [];
  const players = input.players.map((p) => ({ ...p, teamId: config.teams.enabled ? p.teamId : null, active: true }));

  const decks: Record<string, DeckCard[]> = {};
  for (const categoryId of config.categories) {
    decks[categoryId] = shuffle(
      input.questions.filter((q) => q.categoryId === categoryId).map((q) => ({ id: q.id, answer: q.answer })),
      ctx.random,
    );
  }

  const state: GameState = {
    config,
    phase: 'awaitingSpin',
    phaseDeadline: ctx.now + config.spinTimeoutSeconds * 1000,
    paused: null,
    startedAt: ctx.now,
    endsAt: config.winCondition === 'timeLimit' ? ctx.now + config.timeLimitMinutes * 60_000 : null,
    players,
    teams,
    categories: [...config.categories],
    round: 0,
    totalRounds: 0,
    turn: { ownerIndex: 0, questionsThisTurn: 0, captainIndex: Object.fromEntries(teams.map((t) => [t.id, 0])) },
    spinnerId: null,
    spin: null,
    crownPick: null,
    current: null,
    reveal: null,
    scores: {},
    playerStats: Object.fromEntries(players.map((p) => [p.id, { correct: 0, answered: 0, fastestMs: null }])),
    decks,
    asked: [],
    finished: null,
  };

  const owners = ownerIds(state);
  const minimum = config.mode === 'clasico' && config.teams.enabled ? 2 : 1;
  if (owners.length < minimum) return { ok: false, error: 'not_enough_players' };

  state.scores = Object.fromEntries(owners.map((id) => [id, emptyScore()]));
  state.totalRounds = config.mode !== 'clasico' && config.roundsMode === 'perPlayer' ? config.rounds * owners.length : config.rounds;
  state.spinnerId = spinnerFor(state);
  return { ok: true, state, events: [{ type: 'roundStarted', round: 0, spinnerId: state.spinnerId }] };
}
