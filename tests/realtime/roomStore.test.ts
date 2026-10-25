import { beforeEach, describe, expect, it } from 'vitest';
import { useRoom } from '@/realtime/roomStore';
import type { StateEnvelope } from '@/server/games/gameService';

function envelope(game: number, version: number, questionId: string | null = null): StateEnvelope {
  return { game, version, state: { question: questionId ? { id: questionId } : null } as StateEnvelope['state'], question: null };
}

beforeEach(() => useRoom.getState().reset('ABCDE'));

describe('applying broadcast states', () => {
  it('ignores states older than the one on screen', () => {
    const store = useRoom.getState();
    expect(store.applyGame(envelope(1, 5))).toBe(true);
    expect(store.applyGame(envelope(1, 4))).toBe(false);
    expect(store.applyGame(envelope(1, 5))).toBe(false);
    expect(useRoom.getState().game?.version).toBe(5);
  });

  it('takes a rematch even though its version starts over', () => {
    const store = useRoom.getState();
    store.applyGame(envelope(1, 40));
    expect(store.applyGame(envelope(2, 1))).toBe(true);
    expect(store.applyGame(envelope(1, 41))).toBe(false);
    expect(useRoom.getState().game).toMatchObject({ game: 2, version: 1 });
  });

  it('clears who answered when a new question comes in', () => {
    const store = useRoom.getState();
    store.applyGame(envelope(1, 1, 'q1'));
    store.set({ answered: ['p1'] });
    store.applyGame(envelope(1, 2, 'q1'));
    expect(useRoom.getState().answered).toEqual(['p1']);
    store.applyGame(envelope(1, 3, 'q2'));
    expect(useRoom.getState().answered).toEqual([]);
  });
});
