import { describe, expect, it } from 'vitest';
import { gameStats, privateViewFor, toPublicState } from '@/game';
import { act, advanceTo, as, correctChoice, newGame, spinToQuestion, tickThrough } from './helpers';

/** Every key anywhere in a JSON value. */
function keysOf(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysOf(v, out);
    }
  }
  return out;
}

describe('public state', () => {
  it('never carries the decks or the correct answer before the reveal', () => {
    const t = newGame();
    spinToQuestion(t);
    act(t, as('p1'), { type: 'answer', questionId: t.state.current!.questionId, choice: 2 });
    const view = toPublicState(t.state);
    const keys = keysOf(view);
    expect(keys.has('answer')).toBe(false);
    expect(keys.has('decks')).toBe(false);
    expect(keys.has('choice')).toBe(false);
    expect(view.reveal).toBeNull();
    expect(view.question!.answeredBy).toEqual(['p1']);
    const json = JSON.stringify(view);
    for (const card of Object.values(t.state.decks).flat()) expect(json).not.toContain(`"${card.id}"`);
  });

  it('shows the correct option and everyone’s choice at the reveal', () => {
    const t = newGame();
    const q = spinToQuestion(t);
    act(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: correctChoice(t) });
    tickThrough(t);
    const view = toPublicState(t.state);
    expect(view.reveal!.correct).toBe(q.answer);
    expect(view.reveal!.results.p1!.choice).toBe(q.answer);
  });

  it('lets each player see their own choice only', () => {
    const t = newGame();
    const q = spinToQuestion(t);
    act(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: 3 });
    expect(privateViewFor(t.state, 'p1').myChoice).toBe(3);
    expect(privateViewFor(t.state, 'p2').myChoice).toBeNull();
  });

  it('computes podium stats', () => {
    const t = newGame({}, { players: 2 });
    const q = spinToQuestion(t);
    advanceTo(t, q.startedAt + 1800);
    act(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: correctChoice(t) });
    tickThrough(t);
    const stats = gameStats(t.state);
    expect(stats.fastestAnswer).toEqual({ playerId: 'p2', ms: 1800 });
    expect(stats.mvp!.playerId).toBe('p2');
    expect(stats.bestCategory).toEqual({ categoryId: 'tech', rate: 1 });
  });
});
