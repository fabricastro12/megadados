import { describe, expect, it } from 'vitest';
import { privateViewFor, toPublicState } from '@/game';
import { ANSWER_GRACE_MS, EXTRA_TIME_MS } from '@/game/engine/constants';
import { act, advanceTo, as, newGame, reject, spinToQuestion, tickThrough } from './helpers';

describe('lifelines', () => {
  it('50/50 removes two wrong options, never the right one, once per owner', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const t = newGame({}, { seed });
      const q = spinToQuestion(t);
      act(t, as('p1'), { type: 'useLifeline', lifeline: 'fiftyFifty' });
      const removed = t.state.current!.removed.p1!;
      expect(removed).toHaveLength(2);
      expect(removed).not.toContain(q.answer);
      expect(privateViewFor(t.state, 'p1').removedOptions).toEqual(removed);
      expect(privateViewFor(t.state, 'p2').removedOptions).toEqual([]);
    }
  });

  it('each lifeline works once per game', () => {
    const t = newGame({ roundsMode: 'fixed', rounds: 3 });
    spinToQuestion(t);
    act(t, as('p1'), { type: 'useLifeline', lifeline: 'fiftyFifty' });
    reject(t, as('p1'), { type: 'useLifeline', lifeline: 'fiftyFifty' }, 'lifeline_used');
    tickThrough(t);
    tickThrough(t);
    tickThrough(t);
    spinToQuestion(t);
    reject(t, as('p1'), { type: 'useLifeline', lifeline: 'fiftyFifty' }, 'lifeline_used');
    expect(privateViewFor(t.state, 'p1').lifelinesLeft).toEqual(['pass', 'extraTime']);
  });

  it('+10 s extends only that owner’s deadline', () => {
    const t = newGame();
    const q = spinToQuestion(t);
    act(t, as('p1'), { type: 'useLifeline', lifeline: 'extraTime' });
    advanceTo(t, q.deadline + ANSWER_GRACE_MS + 1);
    reject(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: 0 }, 'late');
    act(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: 0 });
    advanceTo(t, q.deadline + EXTRA_TIME_MS + ANSWER_GRACE_MS + 1);
    reject(t, as('p3'), { type: 'answer', questionId: q.questionId, choice: 0 }, 'late');
  });

  it('the question stays open until the extended owner runs out of time', () => {
    const t = newGame();
    const q = spinToQuestion(t);
    act(t, as('p1'), { type: 'useLifeline', lifeline: 'extraTime' });
    advanceTo(t, q.deadline + 1000);
    reject(t, as('p2'), { type: 'tick' }, 'deadline_not_reached');
    advanceTo(t, q.deadline + EXTRA_TIME_MS + ANSWER_GRACE_MS);
    act(t, as('p2'), { type: 'tick' });
    expect(t.state.phase).toBe('reveal');
  });

  it('ronda pass skips the question without breaking the streak', () => {
    const t = newGame({}, { players: 2 });
    t.state.scores.p1!.streak = 2;
    const q = spinToQuestion(t);
    act(t, as('p1'), { type: 'useLifeline', lifeline: 'pass' });
    reject(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: 0 }, 'already_answered');
    act(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: 0 });
    expect(t.state.phase).toBe('reveal');
    expect(t.state.reveal!.results.p1).toMatchObject({ passed: true, points: 0 });
    expect(t.state.scores.p1!.streak).toBe(2);
  });

  it('classic pass swaps in another question of the same category', () => {
    const t = newGame({ mode: 'clasico' });
    const q = spinToQuestion(t);
    act(t, as('p1'), { type: 'useLifeline', lifeline: 'pass' });
    expect(t.state.current!.questionId).not.toBe(q.questionId);
    expect(t.state.current!.categoryId).toBe(q.categoryId);
    expect(t.state.asked).toEqual([q.questionId, t.state.current!.questionId]);
  });

  it('ask the audience: only in classic, other players vote, everyone sees percentages', () => {
    const ronda = newGame();
    spinToQuestion(ronda);
    reject(ronda, as('p1'), { type: 'useLifeline', lifeline: 'audience' }, 'lifeline_unavailable');

    const t = newGame({ mode: 'clasico' }, { players: 4 });
    const q = spinToQuestion(t);
    act(t, as('p1'), { type: 'useLifeline', lifeline: 'audience' });
    reject(t, as('p1'), { type: 'audienceVote', questionId: q.questionId, choice: 1 }, 'not_your_turn');
    act(t, as('p2'), { type: 'audienceVote', questionId: q.questionId, choice: 1 });
    act(t, as('p3'), { type: 'audienceVote', questionId: q.questionId, choice: 1 });
    act(t, as('p4'), { type: 'audienceVote', questionId: q.questionId, choice: 3 });
    reject(t, as('p4'), { type: 'audienceVote', questionId: q.questionId, choice: 2 }, 'already_answered');
    expect(toPublicState(t.state).question!.audience!.percentages).toEqual([0, 67, 0, 33]);
  });

  it('a lifeline the host turned off is refused', () => {
    const t = newGame({ lifelines: { fiftyFifty: false } });
    spinToQuestion(t);
    reject(t, as('p1'), { type: 'useLifeline', lifeline: 'fiftyFifty' }, 'lifeline_disabled');
  });
});
