export const BASE_POINTS = 100;
export const SPEED_POINTS = 100;
export const CROWN_BONUS = 150;

/** Base points plus a speed bonus that falls linearly from SPEED_POINTS to 0 over the answer window. */
export function answerPoints(input: { at: number; startedAt: number; closesAt: number; double: boolean }): number {
  const window = Math.max(1, input.closesAt - input.startedAt);
  const remaining = Math.min(1, Math.max(0, (input.closesAt - input.at) / window));
  const points = BASE_POINTS + Math.round(SPEED_POINTS * remaining);
  return input.double ? points * 2 : points;
}

/**
 * Team vote resolution: the most voted option wins; a tie goes to the option whose
 * first vote came earliest.
 */
export function resolveVotes(votes: { choice: number; at: number }[]): number | null {
  if (votes.length === 0) return null;
  const tally = new Map<number, { count: number; firstAt: number }>();
  for (const v of votes) {
    const entry = tally.get(v.choice);
    if (entry) {
      entry.count += 1;
      entry.firstAt = Math.min(entry.firstAt, v.at);
    } else {
      tally.set(v.choice, { count: 1, firstAt: v.at });
    }
  }
  let best: { choice: number; count: number; firstAt: number } | null = null;
  for (const [choice, { count, firstAt }] of tally) {
    if (!best || count > best.count || (count === best.count && firstAt < best.firstAt)) best = { choice, count, firstAt };
  }
  return best?.choice ?? null;
}
