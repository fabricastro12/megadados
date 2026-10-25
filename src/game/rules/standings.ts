import type { GameState, OwnerScore } from '../types';
import { isTeamPlay } from './owners';

export interface Standing {
  id: string;
  name: string;
  rank: number;
  points: number;
  crowns: number;
}

function nameOf(state: GameState, id: string): string {
  return state.players.find((p) => p.id === id)?.name ?? state.teams.find((t) => t.id === id)?.name ?? id;
}

function byCrownsFirst(state: GameState): boolean {
  return state.config.winCondition === 'mostCrowns' || state.config.winCondition === 'allCrowns';
}

function rank<T extends { points: number; crowns: number; name: string }>(rows: T[], crownsFirst: boolean): (T & { rank: number })[] {
  const key = (r: T) => (crownsFirst ? [r.crowns, r.points] : [r.points, r.crowns]);
  const sorted = [...rows].sort((a, b) => {
    const [a1, a2] = key(a);
    const [b1, b2] = key(b);
    return b1! - a1! || b2! - a2! || a.name.localeCompare(b.name);
  });
  let previous: number[] | null = null;
  let currentRank = 0;
  return sorted.map((row, i) => {
    const k = key(row);
    if (!previous || k[0] !== previous[0] || k[1] !== previous[1]) currentRank = i + 1;
    previous = k;
    return { ...row, rank: currentRank };
  });
}

/** Ranking of score owners (players, or teams in classic team play). Ties share a rank. */
export function ownerStandings(state: GameState): Standing[] {
  const rows = Object.entries(state.scores).map(([id, s]: [string, OwnerScore]) => ({
    id,
    name: nameOf(state, id),
    points: s.points,
    crowns: s.crowns.length,
  }));
  return rank(rows, byCrownsFirst(state));
}

/** Ronda mode with teams: each team scores the average of its members, so team size does not matter. */
export function teamStandings(state: GameState): Standing[] | null {
  if (!state.config.teams.enabled || isTeamPlay(state)) return null;
  const rows = state.teams.map((team) => {
    const members = team.memberIds.map((id) => state.scores[id]).filter((s): s is OwnerScore => !!s);
    const n = Math.max(1, members.length);
    return {
      id: team.id,
      name: team.name,
      points: Math.round(members.reduce((sum, s) => sum + s.points, 0) / n),
      crowns: members.reduce((sum, s) => sum + s.crowns.length, 0),
    };
  });
  return rank(rows, byCrownsFirst(state));
}

/** The ids that won: teams when teams are on, otherwise players. */
export function winnerIds(state: GameState): string[] {
  const table = teamStandings(state) ?? ownerStandings(state);
  return table.filter((s) => s.rank === 1).map((s) => s.id);
}

export interface GameStats {
  mvp: { playerId: string; points: number } | null;
  longestStreak: { ownerId: string; value: number } | null;
  fastestAnswer: { playerId: string; ms: number } | null;
  bestCategory: { categoryId: string; rate: number } | null;
}

export function gameStats(state: GameState): GameStats {
  let mvp: GameStats['mvp'] = null;
  if (!isTeamPlay(state)) {
    for (const [id, s] of Object.entries(state.scores)) if (!mvp || s.points > mvp.points) mvp = { playerId: id, points: s.points };
  } else {
    for (const [id, s] of Object.entries(state.playerStats)) if (!mvp || s.correct > mvp.points) mvp = { playerId: id, points: s.correct };
  }

  let longestStreak: GameStats['longestStreak'] = null;
  for (const [id, s] of Object.entries(state.scores)) {
    if (s.bestStreak > 0 && (!longestStreak || s.bestStreak > longestStreak.value)) longestStreak = { ownerId: id, value: s.bestStreak };
  }

  let fastestAnswer: GameStats['fastestAnswer'] = null;
  for (const [id, s] of Object.entries(state.playerStats)) {
    if (s.fastestMs !== null && (!fastestAnswer || s.fastestMs < fastestAnswer.ms)) fastestAnswer = { playerId: id, ms: s.fastestMs };
  }

  const totals = new Map<string, { correct: number; total: number }>();
  for (const s of Object.values(state.scores)) {
    for (const [cat, v] of Object.entries(s.byCategory)) {
      const t = totals.get(cat) ?? { correct: 0, total: 0 };
      t.correct += v.correct;
      t.total += v.total;
      totals.set(cat, t);
    }
  }
  let bestCategory: GameStats['bestCategory'] = null;
  for (const [cat, t] of totals) {
    const rate = t.total ? t.correct / t.total : 0;
    if (t.total > 0 && (!bestCategory || rate > bestCategory.rate)) bestCategory = { categoryId: cat, rate };
  }
  return { mvp, longestStreak, fastestAnswer, bestCategory };
}
