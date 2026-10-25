import type { GameState, PlayerRef } from '../types';

/**
 * An "owner" holds points, crowns, streaks and lifelines: a team in classic team play,
 * a player everywhere else (in ronda mode team scores are averaged from players).
 */
export function isTeamPlay(state: GameState): boolean {
  return state.config.mode === 'clasico' && state.config.teams.enabled;
}

export function activePlayers(state: GameState): PlayerRef[] {
  return state.players.filter((p) => p.active);
}

export function activeMembers(state: GameState, teamId: string): string[] {
  const team = state.teams.find((t) => t.id === teamId);
  if (!team) return [];
  return team.memberIds.filter((id) => state.players.some((p) => p.id === id && p.active));
}

export function ownerIds(state: GameState): string[] {
  if (isTeamPlay(state)) return state.teams.filter((t) => activeMembers(state, t.id).length > 0).map((t) => t.id);
  return activePlayers(state).map((p) => p.id);
}

export function ownerOf(state: GameState, playerId: string | null): string | null {
  if (!playerId) return null;
  const player = state.players.find((p) => p.id === playerId && p.active);
  if (!player) return null;
  return isTeamPlay(state) ? player.teamId : player.id;
}

export function currentOwnerId(state: GameState): string | null {
  const owners = ownerIds(state);
  if (owners.length === 0) return null;
  return owners[state.turn.ownerIndex % owners.length] ?? null;
}

export function captainOf(state: GameState, teamId: string): string | null {
  const members = activeMembers(state, teamId);
  if (members.length === 0) return null;
  return members[(state.turn.captainIndex[teamId] ?? 0) % members.length] ?? null;
}

/** Who spins now: the rotating player in ronda mode, the owner (or its captain) in classic. */
export function spinnerFor(state: GameState): string | null {
  if (state.config.mode === 'ronda') {
    const players = activePlayers(state);
    if (players.length === 0) return null;
    return players[state.round % players.length]?.id ?? null;
  }
  const owner = currentOwnerId(state);
  if (!owner) return null;
  return isTeamPlay(state) ? captainOf(state, owner) : owner;
}

/** Owners expected to answer the current question. */
export function eligibleOwners(state: GameState): string[] {
  if (state.config.mode === 'ronda') return activePlayers(state).map((p) => p.id);
  const owner = currentOwnerId(state);
  return owner ? [owner] : [];
}
