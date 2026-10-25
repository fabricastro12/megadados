import { describe, expect, it } from 'vitest';
import { GameConfigSchema, applyCommand } from '@/game';
import { ANSWER_GRACE_MS } from '@/game/engine/constants';
import { BASE_POINTS, CROWN_BONUS, SPEED_POINTS } from '@/game/rules/scoring';
import {
  act,
  advanceTo,
  as,
  correctChoice,
  ctxOf,
  isOver,
  newGame,
  reject,
  spinToQuestion,
  system,
  tickThrough,
  wrongChoice,
} from './helpers';

describe('config', () => {
  it('fills nested defaults', () => {
    const config = GameConfigSchema.parse({ categories: ['a', 'b'] });
    expect(config.mode).toBe('ronda');
    expect(config.teams.enabled).toBe(false);
    expect(config.lifelines).toEqual({ fiftyFifty: true, pass: true, extraTime: true, audience: true });
    expect(config.crownStreak).toBe(3);
  });

  it('rejects a wheel with fewer than two categories', () => {
    expect(GameConfigSchema.safeParse({ categories: ['a'] }).success).toBe(false);
  });
});

describe('ronda mode (default)', () => {
  it('starts waiting for the first player to spin', () => {
    const t = newGame();
    expect(t.state.phase).toBe('awaitingSpin');
    expect(t.state.spinnerId).toBe('p1');
    expect(t.state.totalRounds).toBe(3); // one spin per player
  });

  it('only the spinner can spin', () => {
    const t = newGame();
    reject(t, as('p2'), { type: 'spin' }, 'not_your_turn');
    act(t, as('p1'), { type: 'spin' });
    expect(t.state.phase).toBe('spinning');
  });

  it('a tick before the deadline does nothing, after it advances exactly once', () => {
    const t = newGame();
    act(t, as('p1'), { type: 'spin' });
    reject(t, system, { type: 'tick' }, 'deadline_not_reached');
    const deadline = t.state.phaseDeadline!;
    advanceTo(t, deadline);
    const first = applyCommand(t.state, as('p2'), { type: 'tick' }, ctxOf(t));
    const second = applyCommand(t.state, as('p3'), { type: 'tick' }, ctxOf(t));
    // Both ticks read the same state (as two clients racing); the service applies one and the other
    // then sees the new phase, whose deadline has not passed.
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok) return;
    const after = applyCommand(first.state, as('p3'), { type: 'tick' }, ctxOf(t));
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.error).toBe('deadline_not_reached');
  });

  it('everyone answers the same question and the reveal comes as soon as all answered', () => {
    const t = newGame();
    const q = spinToQuestion(t);
    advanceTo(t, q.startedAt + 2000);
    act(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: correctChoice(t) });
    act(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: wrongChoice(t) });
    expect(t.state.phase).toBe('question');
    act(t, as('p3'), { type: 'answer', questionId: q.questionId, choice: correctChoice(t) });
    expect(t.state.phase).toBe('reveal');
    expect(t.state.reveal!.results.p2!.correct).toBe(false);
    expect(t.state.reveal!.results.p2!.points).toBe(0);
  });

  it('scores base points plus a linear speed bonus measured on server time', () => {
    const t = newGame({ questionSeconds: 20 });
    const q = spinToQuestion(t);
    advanceTo(t, q.startedAt + 5000); // a quarter of the window used
    act(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: correctChoice(t) });
    advanceTo(t, q.startedAt + 20_000);
    act(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: correctChoice(t) });
    tickThrough(t);
    expect(t.state.reveal!.results.p1!.points).toBe(BASE_POINTS + SPEED_POINTS * 0.75);
    expect(t.state.reveal!.results.p2!.points).toBe(BASE_POINTS);
    expect(t.state.reveal!.results.p3!.choice).toBeNull();
  });

  it('rejects answers after the deadline but accepts them inside the grace window', () => {
    const t = newGame();
    const q = spinToQuestion(t);
    advanceTo(t, q.deadline + ANSWER_GRACE_MS);
    act(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: 0 });
    advanceTo(t, q.deadline + ANSWER_GRACE_MS + 1);
    reject(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: 0 }, 'late');
  });

  it('accepts one answer per player and ignores answers to an old question', () => {
    const t = newGame();
    const q = spinToQuestion(t);
    act(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: 1 });
    reject(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: 2 }, 'already_answered');
    reject(t, as('p2'), { type: 'answer', questionId: 'other', choice: 2 }, 'stale_question');
  });

  it('two answers from the same player in the same millisecond count once', () => {
    const t = newGame();
    const q = spinToQuestion(t);
    advanceTo(t, q.startedAt + 1000);
    const first = applyCommand(t.state, as('p1'), { type: 'answer', questionId: q.questionId, choice: 1 }, ctxOf(t));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyCommand(first.state, as('p1'), { type: 'answer', questionId: q.questionId, choice: 2 }, ctxOf(t));
    expect(second.ok).toBe(false);
  });

  it('spectators cannot answer', () => {
    const t = newGame();
    const q = spinToQuestion(t);
    reject(t, { playerId: null, role: 'spectator' }, { type: 'answer', questionId: q.questionId, choice: 1 }, 'not_participant');
  });

  it('rotates the spinner every round and ends after the last one', () => {
    const t = newGame({}, { players: 2 });
    const spinners: string[] = [];
    while (!isOver(t)) {
      spinners.push(t.state.spinnerId!);
      spinToQuestion(t);
      tickThrough(t); // reveal
      tickThrough(t); // round results
      if (!isOver(t)) tickThrough(t);
    }
    expect(spinners).toEqual(['p1', 'p2']);
    expect(t.state.finished!.reason).toBe('rounds');
  });

  it('three correct answers in a row win the crown of that category plus a bonus', () => {
    const t = newGame({ roundsMode: 'fixed', rounds: 5 }, { players: 2 });
    for (let i = 0; i < 3; i++) {
      const q = spinToQuestion(t);
      advanceTo(t, q.deadline); // no speed bonus, to compare totals
      act(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: correctChoice(t) });
      act(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: wrongChoice(t) });
      if (i < 2) {
        tickThrough(t); // reveal → round results
        tickThrough(t); // → next spinner
      }
    }
    const r = t.state.reveal!.results.p1!;
    expect(r.crownAwarded).toBe('tech');
    expect(r.points).toBe(BASE_POINTS + CROWN_BONUS);
    expect(t.state.scores.p1!.crowns).toEqual(['tech']);
    expect(t.state.scores.p1!.streak).toBe(0);
    expect(t.state.scores.p1!.bestStreak).toBe(3);
  });

  it('never repeats a question in the same game, falling back to other categories', () => {
    const t = newGame({ roundsMode: 'fixed', rounds: 6 }, { players: 1, perCategory: 3 });
    const asked: string[] = [];
    while (!isOver(t)) {
      const q = spinToQuestion(t); // always lands on "tech", which only has 3 cards
      asked.push(q.questionId);
      tickThrough(t);
      tickThrough(t);
      if (!isOver(t)) tickThrough(t);
    }
    expect(new Set(asked).size).toBe(6);
    expect(asked.filter((id) => id.startsWith('latam')).length).toBe(3);
  });

  it('ends the game when no questions are left', () => {
    const t = newGame({ roundsMode: 'fixed', rounds: 10 }, { players: 1, perCategory: 1 });
    for (let i = 0; i < 2; i++) {
      spinToQuestion(t);
      tickThrough(t);
      tickThrough(t);
      tickThrough(t);
    }
    act(t, as('p1'), { type: 'spin' });
    tickThrough(t);
    expect(t.state.phase).toBe('finished');
    expect(t.state.finished!.reason).toBe('outOfQuestions');
  });

  it('spins by itself when the spinner does not show up', () => {
    const t = newGame();
    tickThrough(t);
    expect(t.state.phase).toBe('spinning');
  });

  it('the crown segment lets the spinner pick the category and doubles the points', () => {
    const t = newGame();
    t.random = () => 0.99; // last segment: the crown
    act(t, as('p1'), { type: 'spin' });
    tickThrough(t);
    expect(t.state.phase).toBe('crownPick');
    reject(t, as('p2'), { type: 'pickCategory', categoryId: 'latam' }, 'not_your_turn');
    act(t, as('p1'), { type: 'pickCategory', categoryId: 'latam' });
    const q = t.state.current!;
    expect(q.categoryId).toBe('latam');
    expect(q.isCrown).toBe(true);
    advanceTo(t, q.deadline);
    act(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: q.answer });
    tickThrough(t);
    expect(t.state.reveal!.results.p2!.points).toBe(BASE_POINTS * 2);
  });

  it('a time limit ends the game after the current question', () => {
    const t = newGame({ winCondition: 'timeLimit', timeLimitMinutes: 5, roundsMode: 'fixed', rounds: 50 });
    const q = spinToQuestion(t);
    act(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: 0 });
    advanceTo(t, t.state.endsAt! + 1);
    tickThrough(t); // question closes
    expect(t.state.phase).toBe('reveal');
    tickThrough(t);
    expect(t.state.finished!.reason).toBe('timeLimit');
  });

  it('teams in ronda mode score the average of their members', () => {
    const t = newGame(
      { teams: { enabled: true } },
      { players: 3, teams: [{ id: 'A', name: 'Cóndores', members: [1, 2] }, { id: 'B', name: 'Llamas', members: [3] }] },
    );
    const q = spinToQuestion(t);
    advanceTo(t, q.deadline);
    act(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: correctChoice(t) });
    act(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: wrongChoice(t) });
    act(t, as('p3'), { type: 'answer', questionId: q.questionId, choice: correctChoice(t) });
    const result = applyCommand(t.state, system, { type: 'end' }, ctxOf(t));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.finished!.winnerIds).toEqual(['B']);
  });
});
