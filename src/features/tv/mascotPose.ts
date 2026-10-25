import type { PublicGameState } from '@/game';
import type { MascotPoseName } from '@/scene3d/mascot/poses';

/** How the mascot reacts to what is on screen. */
export function mascotPose(s: PublicGameState): MascotPoseName {
  const phase = s.phase === 'paused' ? s.pausedPhase : s.phase;
  switch (phase) {
    case 'spinning':
      return 'sorpresa';
    case 'crownPick':
      return 'carta';
    case 'question':
      return 'pensando';
    case 'reveal': {
      const results = Object.values(s.reveal?.results ?? {});
      const right = results.filter((r) => r.correct).length;
      return results.length > 0 && right * 2 >= results.length ? 'festejo' : 'sorpresa';
    }
    case 'roundResults':
      return 'guino';
    case 'finished':
      return 'festejo';
    default:
      return 'saludo';
  }
}
