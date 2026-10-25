import { describe, expect, it } from 'vitest';
import { resolveVotes } from '@/game/rules/scoring';
import { act, advanceTo, as, correctChoice, newGame, reject, spinToQuestion, tickThrough, wrongChoice } from './helpers';

const teams = [
  { id: 'A', name: 'Cóndores', members: [1, 2] },
  { id: 'B', name: 'Llamas', members: [3, 4] },
];

function classicTeams(answerMode: 'captain' | 'vote' | 'first') {
  return newGame(
    { mode: 'clasico', roundsMode: 'fixed', rounds: 4, teams: { enabled: true, answerMode } },
    { players: 4, teams },
  );
}

describe('classic team play', () => {
  it('needs at least two teams with players', () => {
    expect(() =>
      newGame({ mode: 'clasico', teams: { enabled: true } }, { players: 2, teams: [{ id: 'A', name: 'Solo', members: [1, 2] }] }),
    ).toThrow('not_enough_players');
  });

  it('points, crowns and streaks belong to the team', () => {
    const t = classicTeams('captain');
    expect(Object.keys(t.state.scores)).toEqual(['A', 'B']);
  });

  it('captain mode: only the rotating captain answers', () => {
    const t = classicTeams('captain');
    expect(t.state.spinnerId).toBe('p1');
    const q = spinToQuestion(t);
    reject(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: 0 }, 'not_your_turn');
    reject(t, as('p3'), { type: 'answer', questionId: q.questionId, choice: 0 }, 'not_your_turn');
    act(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: wrongChoice(t) });
    tickThrough(t);
    expect(t.state.spinnerId).toBe('p3'); // team B's first captain
    spinToQuestion(t);
    act(t, as('p3'), { type: 'answer', questionId: t.state.current!.questionId, choice: wrongChoice(t) });
    tickThrough(t);
    expect(t.state.spinnerId).toBe('p2'); // team A again, captain rotated
  });

  it('first mode: the first teammate to answer locks it in', () => {
    const t = classicTeams('first');
    const q = spinToQuestion(t);
    advanceTo(t, q.startedAt + 1000);
    act(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: correctChoice(t) });
    expect(t.state.phase).toBe('reveal');
    expect(t.state.reveal!.results.A!.correct).toBe(true);
  });

  it('vote mode: answers must go through votes and the most voted option wins', () => {
    const t = classicTeams('vote');
    const q = spinToQuestion(t);
    reject(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: 0 }, 'use_vote');
    act(t, as('p1'), { type: 'vote', questionId: q.questionId, choice: correctChoice(t) });
    reject(t, as('p1'), { type: 'vote', questionId: q.questionId, choice: 1 }, 'already_answered');
    reject(t, as('p3'), { type: 'vote', questionId: q.questionId, choice: 1 }, 'not_your_turn');
    act(t, as('p2'), { type: 'vote', questionId: q.questionId, choice: correctChoice(t) });
    expect(t.state.phase).toBe('reveal');
    expect(t.state.reveal!.results.A!.correct).toBe(true);
  });

  it('vote mode resolves at the deadline with whoever voted', () => {
    const t = classicTeams('vote');
    const q = spinToQuestion(t);
    act(t, as('p2'), { type: 'vote', questionId: q.questionId, choice: correctChoice(t) });
    tickThrough(t);
    expect(t.state.reveal!.results.A!.choice).toBe(correctChoice({ ...t, state: { ...t.state, current: q } }));
  });

  it('a vote tie goes to the option whose first vote came earliest', () => {
    expect(resolveVotes([{ choice: 2, at: 10 }, { choice: 1, at: 5 }, { choice: 2, at: 20 }, { choice: 1, at: 30 }])).toBe(1);
    expect(resolveVotes([{ choice: 3, at: 10 }, { choice: 0, at: 5 }, { choice: 3, at: 20 }])).toBe(3);
    expect(resolveVotes([])).toBeNull();
  });
});
