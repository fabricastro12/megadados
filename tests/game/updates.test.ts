import { describe, expect, it } from 'vitest';
import { CommandSchema, GameConfigSchema, toPublicState } from '@/game';
import { LobbyActionSchema } from '@/rooms/model';
import { act, as, host, newGame, spinToQuestion, tickThrough, wrongChoice } from './helpers';

describe('retired features', () => {
  it('rejects extra time and expulsion at both command boundaries', () => {
    expect(CommandSchema.safeParse({ type: 'useLifeline', lifeline: 'extraTime' }).success).toBe(false);
    const kick = { type: 'kick', playerId: '00000000-0000-4000-8000-000000000001' };
    expect(CommandSchema.safeParse(kick).success).toBe(false);
    expect(LobbyActionSchema.safeParse(kick).success).toBe(false);
  });
});

describe('time limited matches', () => {
  it.each(['ronda', 'clasico', 'imagenes'] as const)('%s keeps playing beyond the configured round count', (mode) => {
    const t = newGame({ mode, winCondition: 'timeLimit', timeLimitMinutes: 5, roundsMode: 'fixed', rounds: 1 }, { players: 1 });
    for (let i = 0; i < 3; i++) {
      const q = spinToQuestion(t);
      act(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: wrongChoice(t) });
      tickThrough(t);
      if (t.state.phase === 'roundResults') tickThrough(t);
      expect(t.state.phase).toBe('awaitingSpin');
    }
    const q = spinToQuestion(t);
    t.now = t.state.endsAt! + 300;
    act(t, as('p1'), { type: 'tick' });
    expect(t.state.reveal?.questionId).toBe(q.questionId);
    tickThrough(t);
    expect(t.state.finished?.reason).toBe('timeLimit');
  });
});

describe('image mode and closing statistics', () => {
  it('rotates the wheel and lets everyone answer in image mode', () => {
    const t = newGame({ mode: 'imagenes' }, { players: 2 });
    const q = spinToQuestion(t);
    act(t, as('p1'), { type: 'answer', questionId: q.questionId, choice: q.answer });
    expect(t.state.phase).toBe('question');
    act(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: q.answer });
    tickThrough(t);
    expect(t.state.phase).toBe('roundResults');
    tickThrough(t);
    expect(t.state.spinnerId).toBe('p2');
  });

  it('only exposes final statistics when the match is finished', () => {
    const t = newGame();
    const q = spinToQuestion(t);
    t.now = q.startedAt + 2000;
    act(t, as('p2'), { type: 'answer', questionId: q.questionId, choice: q.answer });
    tickThrough(t);
    expect(toPublicState(t.state).stats).toBeNull();
    act(t, host, { type: 'end' });
    expect(toPublicState(t.state).stats).toMatchObject({
      mvp: { playerId: 'p2' }, fastestAnswer: { playerId: 'p2', ms: 2000 },
      longestStreak: { ownerId: 'p2', value: 1 }, bestCategory: { categoryId: q.categoryId, rate: 1 },
    });
  });

  it('limits the wheel to six distinct categories', () => {
    expect(GameConfigSchema.safeParse({ categories: ['a', 'a'] }).success).toBe(false);
    expect(GameConfigSchema.safeParse({ categories: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).success).toBe(false);
  });
});
