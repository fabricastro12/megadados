import type { Lifeline } from './config';
import { eligibleOwners, ownerOf } from './rules/owners';
import { type Standing, ownerStandings, teamStandings } from './rules/standings';
import type { GameState, OwnerScore, Phase, RevealState, SpinState } from './types';

/**
 * What every client in the room may see. The decks and the correct answer never appear here
 * before the reveal; nor do other people's choices.
 */
export interface PublicGameState {
  phase: Phase;
  pausedPhase: Phase | null;
  phaseDeadline: number | null;
  endsAt: number | null;
  round: number;
  totalRounds: number;
  mode: GameState['config']['mode'];
  questionSeconds: number;
  categories: string[];
  players: GameState['players'];
  teams: GameState['teams'];
  spinnerId: string | null;
  turnOwnerId: string | null;
  spin: SpinState | null;
  crownPick: GameState['crownPick'];
  question: {
    id: string;
    categoryId: string;
    isCrown: boolean;
    startedAt: number;
    deadline: number;
    /** Owners who answered or passed; not what they chose. */
    answeredBy: string[];
    eligible: string[];
    audience: { openUntil: number; percentages: number[] } | null;
  } | null;
  reveal: RevealState | null;
  scores: Record<string, Pick<OwnerScore, 'points' | 'crowns' | 'streak' | 'usedLifelines'>>;
  standings: Standing[];
  teamStandings: Standing[] | null;
  finished: GameState['finished'];
}

export interface PrivateView {
  ownerId: string | null;
  myChoice: number | null;
  removedOptions: number[];
  myDeadline: number | null;
  lifelinesLeft: Lifeline[];
}

function percentages(votes: Record<string, number>): number[] {
  const counts = [0, 0, 0, 0];
  for (const choice of Object.values(votes)) counts[choice] = (counts[choice] ?? 0) + 1;
  const total = counts.reduce((a, b) => a + b, 0);
  return counts.map((c) => (total ? Math.round((c / total) * 100) : 0));
}

export function toPublicState(state: GameState): PublicGameState {
  const q = state.current;
  const showQuestion = q && (state.phase === 'question' || state.phase === 'paused' || state.phase === 'reveal' || state.phase === 'roundResults');
  const scores: PublicGameState['scores'] = {};
  for (const [id, s] of Object.entries(state.scores)) {
    scores[id] = { points: s.points, crowns: [...s.crowns], streak: s.streak, usedLifelines: [...s.usedLifelines] };
  }
  return {
    phase: state.phase,
    pausedPhase: state.paused?.phase ?? null,
    phaseDeadline: state.phaseDeadline,
    endsAt: state.endsAt,
    round: state.round,
    totalRounds: state.totalRounds,
    mode: state.config.mode,
    questionSeconds: state.config.questionSeconds,
    categories: [...state.categories],
    players: state.players.map((p) => ({ ...p })),
    teams: state.teams.map((t) => ({ ...t, memberIds: [...t.memberIds] })),
    spinnerId: state.spinnerId,
    turnOwnerId: state.config.mode === 'clasico' ? (eligibleOwners(state)[0] ?? null) : null,
    spin: state.spin ? { ...state.spin } : null,
    crownPick: state.crownPick ? { ...state.crownPick, options: [...state.crownPick.options] } : null,
    question: showQuestion
      ? {
          id: q.questionId,
          categoryId: q.categoryId,
          isCrown: q.isCrown,
          startedAt: q.startedAt,
          deadline: q.deadline,
          answeredBy: [...Object.keys(q.answers), ...q.passed],
          eligible: eligibleOwners(state),
          audience: q.audience ? { openUntil: q.audience.openUntil, percentages: percentages(q.audience.votes) } : null,
        }
      : null,
    reveal: state.phase === 'reveal' || state.phase === 'roundResults' || state.phase === 'finished' ? structuredClone(state.reveal) : null,
    scores,
    standings: ownerStandings(state),
    teamStandings: teamStandings(state),
    finished: state.finished ? { ...state.finished, winnerIds: [...state.finished.winnerIds] } : null,
  };
}

/** The extra bits one player may see about themselves. */
export function privateViewFor(state: GameState, playerId: string): PrivateView {
  const ownerId = ownerOf(state, playerId);
  const q = state.current;
  const used = ownerId ? (state.scores[ownerId]?.usedLifelines ?? []) : [];
  return {
    ownerId,
    myChoice: ownerId && q ? (q.answers[ownerId]?.choice ?? q.votes[playerId]?.choice ?? null) : null,
    removedOptions: ownerId && q ? [...(q.removed[ownerId] ?? [])] : [],
    myDeadline: ownerId && q ? q.deadline + (q.extraMs[ownerId] ?? 0) : null,
    lifelinesLeft: (['fiftyFifty', 'pass', 'extraTime', 'audience'] as const).filter(
      (l) => state.config.lifelines[l] && !used.includes(l) && !(l === 'audience' && state.config.mode === 'ronda'),
    ),
  };
}
