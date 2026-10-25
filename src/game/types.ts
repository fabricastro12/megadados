import type { GameConfig, Lifeline } from './config';

export type Phase =
  | 'awaitingSpin'
  | 'spinning'
  | 'crownPick'
  | 'question'
  | 'reveal'
  | 'roundResults'
  | 'paused'
  | 'finished';

export interface PlayerRef {
  id: string;
  name: string;
  teamId: string | null;
  /** False once the host kicks the player; their scores stay for the record. */
  active: boolean;
}

export interface TeamRef {
  id: string;
  name: string;
  memberIds: string[];
}

/** A question in a category deck. `answer` is the correct index and never leaves the server. */
export interface DeckCard {
  id: string;
  answer: number;
}

export interface OwnerScore {
  points: number;
  crowns: string[];
  streak: number;
  bestStreak: number;
  correct: number;
  answered: number;
  fastestMs: number | null;
  usedLifelines: Lifeline[];
  byCategory: Record<string, { correct: number; total: number }>;
}

export interface PlayerStats {
  correct: number;
  answered: number;
  fastestMs: number | null;
}

export interface SpinState {
  segment: number;
  /** null when the wheel lands on the crown segment. */
  categoryId: string | null;
  startedAt: number;
  durationMs: number;
  /** Full turns before landing, so every client animates the same spin. */
  turns: number;
}

export interface AnswerRecord {
  choice: number;
  at: number;
  byPlayerId: string;
}

export interface CurrentQuestion {
  questionId: string;
  categoryId: string;
  /** Secret: the correct option index. */
  answer: number;
  /** Classic: a crown question. Ronda: the spinner picked the category, points count double. */
  isCrown: boolean;
  startedAt: number;
  deadline: number;
  /** Keyed by owner (player, or team in classic team mode). */
  extraMs: Record<string, number>;
  removed: Record<string, number[]>;
  answers: Record<string, AnswerRecord>;
  passed: string[];
  /** Team vote mode, keyed by player. */
  votes: Record<string, AnswerRecord>;
  audience: { openUntil: number; votes: Record<string, number> } | null;
}

export interface OwnerResult {
  choice: number | null;
  correct: boolean;
  passed: boolean;
  points: number;
  crownAwarded: string | null;
}

export interface RevealState {
  questionId: string;
  categoryId: string;
  correct: number;
  results: Record<string, OwnerResult>;
}

export type FinishReason = 'rounds' | 'allCrowns' | 'timeLimit' | 'host' | 'outOfQuestions' | 'noPlayers';

export interface GameState {
  config: GameConfig;
  phase: Phase;
  /** When the current phase ends on its own (a client `tick` advances it). */
  phaseDeadline: number | null;
  paused: { phase: Phase; at: number } | null;
  startedAt: number;
  endsAt: number | null;
  players: PlayerRef[];
  teams: TeamRef[];
  /** Wheel segments, in order; the crown segment comes last. */
  categories: string[];
  round: number;
  totalRounds: number;
  /** Classic mode bookkeeping. */
  turn: { ownerIndex: number; questionsThisTurn: number; captainIndex: Record<string, number> };
  spinnerId: string | null;
  spin: SpinState | null;
  crownPick: { ownerId: string; options: string[] } | null;
  current: CurrentQuestion | null;
  reveal: RevealState | null;
  scores: Record<string, OwnerScore>;
  playerStats: Record<string, PlayerStats>;
  decks: Record<string, DeckCard[]>;
  asked: string[];
  finished: { reason: FinishReason; at: number; winnerIds: string[] } | null;
}

export type ActorRole = 'host' | 'player' | 'spectator' | 'system';

export interface Actor {
  playerId: string | null;
  role: ActorRole;
}

export interface EngineContext {
  now: number;
  /** Uniform in [0, 1). The server passes a CSPRNG; tests pass a seeded one. */
  random: () => number;
}

export type GameEvent =
  | { type: 'spinStarted'; spin: SpinState; spinnerId: string | null }
  | { type: 'crownPickStarted'; ownerId: string; options: string[] }
  | { type: 'questionShown'; questionId: string; categoryId: string; isCrown: boolean }
  | { type: 'answered'; ownerId: string; playerId: string; choice: number; at: number }
  | { type: 'voted'; playerId: string }
  | { type: 'lifelineUsed'; ownerId: string; lifeline: Lifeline }
  | { type: 'revealed'; reveal: RevealState }
  | { type: 'crownWon'; ownerId: string; categoryId: string }
  | { type: 'turnChanged'; ownerId: string; spinnerId: string | null }
  | { type: 'roundStarted'; round: number; spinnerId: string | null }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'pointsAdjusted'; ownerId: string; delta: number }
  | { type: 'playerKicked'; playerId: string }
  | { type: 'playerJoined'; playerId: string }
  | { type: 'gameOver'; reason: FinishReason; winnerIds: string[] };

export type EngineError =
  | 'wrong_phase'
  | 'not_your_turn'
  | 'not_participant'
  | 'not_host'
  | 'late'
  | 'already_answered'
  | 'stale_question'
  | 'use_vote'
  | 'lifeline_disabled'
  | 'lifeline_used'
  | 'lifeline_unavailable'
  | 'invalid_category'
  | 'deadline_not_reached'
  | 'paused'
  | 'game_over'
  | 'late_join_closed'
  | 'unknown_player'
  | 'not_enough_players';

export type EngineResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: EngineError };
