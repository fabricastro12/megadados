import { describe, expect, it } from 'vitest';
import { act, advanceTo, as, host, newGame, reject, spinToQuestion, system, tickThrough } from './helpers';

describe('host controls', () => {
  it('players cannot use host commands', () => {
    const t = newGame();
    for (const command of [{ type: 'pause' }, { type: 'end' }, { type: 'skip' }, { type: 'kick', playerId: 'p3' }] as const) {
      reject(t, as('p2'), command, 'not_host');
    }
    reject(t, as('p2'), { type: 'addPlayer', player: { id: 'x', name: 'X', teamId: null } }, 'not_host');
  });

  it('pause freezes the clock and resume gives the time back', () => {
    const t = newGame();
    const q = spinToQuestion(t);
    advanceTo(t, q.startedAt + 5000);
    act(t, host, { type: 'pause' });
    reject(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: 0 }, 'paused');
    reject(t, system, { type: 'tick' }, 'paused');
    advanceTo(t, q.startedAt + 65_000);
    act(t, host, { type: 'resume' });
    expect(t.state.phase).toBe('question');
    expect(t.state.current!.deadline).toBe(q.deadline + 60_000);
    act(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: 0 });
  });

  it('skip advances the current phase without waiting', () => {
    const t = newGame();
    spinToQuestion(t);
    act(t, host, { type: 'skip' });
    expect(t.state.phase).toBe('reveal');
  });

  it('adjusts points and never goes below zero', () => {
    const t = newGame();
    act(t, host, { type: 'adjustPoints', ownerId: 'p2', delta: 250 });
    act(t, host, { type: 'adjustPoints', ownerId: 'p2', delta: -1000 });
    expect(t.state.scores.p2!.points).toBe(0);
    reject(t, host, { type: 'adjustPoints', ownerId: 'nobody', delta: 1 }, 'unknown_player');
  });

  it('kicking the spinner hands the wheel to the next player', () => {
    const t = newGame();
    act(t, host, { type: 'kick', playerId: 'p1' });
    expect(t.state.spinnerId).toBe('p2');
    reject(t, as('p1'), { type: 'spin' }, 'not_your_turn');
  });

  it('kicking the last pending player reveals the question', () => {
    const t = newGame();
    const q = spinToQuestion(t);
    act(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: 0 });
    act(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: 0 });
    act(t, host, { type: 'kick', playerId: 'p3' });
    expect(t.state.phase).toBe('reveal');
    expect(Object.keys(t.state.reveal!.results)).toEqual(['p1', 'p2']);
  });

  it('kicking the player in turn passes the turn in classic mode', () => {
    const t = newGame({ mode: 'clasico' });
    spinToQuestion(t);
    act(t, host, { type: 'kick', playerId: 'p1' });
    expect(t.state.phase).toBe('awaitingSpin');
    expect(t.state.spinnerId).toBe('p2');
  });

  it('late joiners enter the rotation when allowed', () => {
    const t = newGame();
    act(t, system, { type: 'addPlayer', player: { id: 'p9', name: 'Tardío', teamId: null } });
    expect(t.state.scores.p9).toBeDefined();
    const closed = newGame({ allowLateJoin: false });
    reject(closed, system, { type: 'addPlayer', player: { id: 'p9', name: 'Tardío', teamId: null } }, 'late_join_closed');
  });

  it('ending the game declares the leader the winner and blocks further commands', () => {
    const t = newGame();
    act(t, host, { type: 'adjustPoints', ownerId: 'p3', delta: 50 });
    act(t, host, { type: 'end' });
    expect(t.state.finished).toMatchObject({ reason: 'host', winnerIds: ['p3'] });
    reject(t, as('p1'), { type: 'spin' }, 'game_over');
    reject(t, system, { type: 'tick' }, 'game_over');
    expect(tickThrough).toBeTypeOf('function');
  });
});
