import { describe, expect, it } from 'vitest';
import { act, advanceTo, as, correctChoice, newGame, reject, spinToQuestion, tickThrough, wrongChoice } from './helpers';

const classic = { mode: 'clasico' as const, roundsMode: 'fixed' as const, rounds: 3 };

function answerCurrent(t: ReturnType<typeof newGame>, playerId: string, right: boolean) {
  const q = t.state.current!;
  act(t, as(playerId), { type: 'answer', questionId: q.questionId, choice: right ? correctChoice(t) : wrongChoice(t) });
}

describe('classic turn mode', () => {
  it('only the player in turn answers', () => {
    const t = newGame(classic);
    const q = spinToQuestion(t);
    reject(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: 0 }, 'not_your_turn');
    answerCurrent(t, 'p1', true);
    expect(t.state.phase).toBe('reveal');
  });

  it('a correct answer keeps the turn, a wrong one passes it', () => {
    const t = newGame(classic);
    spinToQuestion(t);
    answerCurrent(t, 'p1', true);
    tickThrough(t);
    expect(t.state.phase).toBe('awaitingSpin');
    expect(t.state.spinnerId).toBe('p1');
    spinToQuestion(t);
    answerCurrent(t, 'p1', false);
    tickThrough(t);
    expect(t.state.spinnerId).toBe('p2');
  });

  it('a streak lets the player pick a missing category for a crown question', () => {
    const t = newGame({ ...classic, crownStreak: 2 });
    for (let i = 0; i < 2; i++) {
      spinToQuestion(t);
      answerCurrent(t, 'p1', true);
      tickThrough(t);
    }
    expect(t.state.phase).toBe('crownPick');
    expect(t.state.crownPick!.options).toEqual(['tech', 'latam']);
    act(t, as('p1'), { type: 'pickCategory', categoryId: 'latam' });
    expect(t.state.current!.isCrown).toBe(true);
    answerCurrent(t, 'p1', true);
    expect(t.state.reveal!.results.p1!.crownAwarded).toBe('latam');
    tickThrough(t);
    expect(t.state.scores.p1!.crowns).toEqual(['latam']);
    expect(t.state.spinnerId).toBe('p1'); // keeps playing after the crown
  });

  it('crown picks only offer categories the player still lacks', () => {
    const t = newGame({ ...classic, crownStreak: 2 });
    t.state.scores.p1!.crowns = ['tech'];
    for (let i = 0; i < 2; i++) {
      spinToQuestion(t);
      answerCurrent(t, 'p1', true);
      tickThrough(t);
    }
    expect(t.state.crownPick!.options).toEqual(['latam']);
    reject(t, as('p1'), { type: 'pickCategory', categoryId: 'tech' }, 'invalid_category');
  });

  it('a wrong crown answer passes the turn and spends the streak', () => {
    const t = newGame({ ...classic, crownStreak: 2 });
    for (let i = 0; i < 2; i++) {
      spinToQuestion(t);
      answerCurrent(t, 'p1', true);
      tickThrough(t);
    }
    act(t, as('p1'), { type: 'pickCategory', categoryId: 'tech' });
    answerCurrent(t, 'p1', false);
    tickThrough(t);
    expect(t.state.scores.p1!.crowns).toEqual([]);
    expect(t.state.scores.p1!.streak).toBe(0);
    expect(t.state.spinnerId).toBe('p2');
  });

  it('a turn ends after the per-turn question cap', () => {
    const t = newGame({ ...classic, maxQuestionsPerTurn: 2, crownStreak: 10 });
    for (let i = 0; i < 2; i++) {
      spinToQuestion(t);
      answerCurrent(t, 'p1', true);
      tickThrough(t);
    }
    expect(t.state.spinnerId).toBe('p2');
  });

  it('getting every crown wins on the spot under "all crowns"', () => {
    const t = newGame({ ...classic, winCondition: 'allCrowns', crownStreak: 2 });
    t.state.scores.p1!.crowns = ['tech'];
    for (let i = 0; i < 2; i++) {
      spinToQuestion(t);
      answerCurrent(t, 'p1', true);
      tickThrough(t);
    }
    act(t, as('p1'), { type: 'pickCategory', categoryId: 'latam' });
    answerCurrent(t, 'p1', true);
    tickThrough(t);
    expect(t.state.phase).toBe('finished');
    expect(t.state.finished).toMatchObject({ reason: 'allCrowns', winnerIds: ['p1'] });
  });

  it('a full lap of players is one round; the game ends after the configured rounds', () => {
    const t = newGame({ ...classic, rounds: 1 }, { players: 2 });
    spinToQuestion(t);
    answerCurrent(t, 'p1', false);
    tickThrough(t);
    expect(t.state.round).toBe(0);
    spinToQuestion(t);
    answerCurrent(t, 'p2', false);
    tickThrough(t);
    expect(t.state.finished!.reason).toBe('rounds');
  });

  it('can skip the turn of a player who does not spin', () => {
    const t = newGame({ ...classic, spinTimeoutAction: 'skipTurn' });
    tickThrough(t);
    expect(t.state.phase).toBe('awaitingSpin');
    expect(t.state.spinnerId).toBe('p2');
  });

  it('a timed-out answer counts as wrong', () => {
    const t = newGame(classic);
    const q = spinToQuestion(t);
    advanceTo(t, q.deadline + 1000);
    tickThrough(t);
    expect(t.state.reveal!.results.p1).toMatchObject({ choice: null, correct: false });
    tickThrough(t);
    expect(t.state.spinnerId).toBe('p2');
  });

  it('most crowns ranks crowns before points', () => {
    const t = newGame({ ...classic, winCondition: 'mostCrowns', rounds: 1 }, { players: 2 });
    t.state.scores.p1!.points = 900;
    t.state.scores.p2!.points = 100;
    t.state.scores.p2!.crowns = ['tech'];
    act(t, { playerId: 'p1', role: 'host' }, { type: 'end' });
    expect(t.state.finished!.winnerIds).toEqual(['p2']);
  });
});
