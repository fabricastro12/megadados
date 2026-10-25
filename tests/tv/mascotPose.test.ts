import { describe, expect, it } from 'vitest';
import type { PublicGameState } from '@/game';
import { mascotPose } from '@/features/tv/mascotPose';

const state = (partial: Partial<PublicGameState>) => ({ phase: 'awaitingSpin', pausedPhase: null, reveal: null, ...partial }) as PublicGameState;
const result = (correct: boolean) => ({ choice: 0, correct, passed: false, points: 0, crownAwarded: null });

describe('mascot reactions on the TV', () => {
  it('follows the phase', () => {
    expect(mascotPose(state({ phase: 'awaitingSpin' }))).toBe('saludo');
    expect(mascotPose(state({ phase: 'spinning' }))).toBe('sorpresa');
    expect(mascotPose(state({ phase: 'crownPick' }))).toBe('carta');
    expect(mascotPose(state({ phase: 'question' }))).toBe('pensando');
    expect(mascotPose(state({ phase: 'finished' }))).toBe('festejo');
  });

  it('celebrates a reveal when at least half got it right', () => {
    const reveal = (rights: boolean[]) =>
      state({ phase: 'reveal', reveal: { questionId: 'q', categoryId: 'c', correct: 0, results: Object.fromEntries(rights.map((r, i) => [`p${i}`, result(r)])) } });
    expect(mascotPose(reveal([true, false]))).toBe('festejo');
    expect(mascotPose(reveal([true, false, false]))).toBe('sorpresa');
  });

  it('keeps the pose of the paused phase', () => {
    expect(mascotPose(state({ phase: 'paused', pausedPhase: 'question' }))).toBe('pensando');
  });
});
