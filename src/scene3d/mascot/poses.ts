export type MascotExpression = 'happy' | 'grin' | 'wink' | 'surprised' | 'thinking';
export type MascotHand = 'open' | 'fist' | 'thumbsUp' | 'point';
export type MascotPoseName = 'idle' | 'saludo' | 'festejo' | 'guino' | 'sorpresa' | 'pensando' | 'carta';

type Vec3 = readonly [number, number, number];

/**
 * One arm, solved with two-bone IK in torso space (front is +Z, the mascot's left is +X).
 * Values are written for the left arm; the rig mirrors X for the right one.
 */
export interface ArmPose {
  /** Where the wrist goes. */
  wrist: Vec3;
  /** Direction the elbow bends toward. */
  pole: Vec3;
  /** Direction the back of the hand (knuckles and thumb) faces. */
  facing: Vec3;
  hand: MascotHand;
}

export interface MascotPose {
  right: ArmPose;
  left: ArmPose;
  /** Body lean: [forward, sideways toward the mascot's left]. */
  lean: readonly [number, number];
  expression: MascotExpression;
  prop?: 'card';
}

const relaxed: ArmPose = { wrist: [0.7, 0.6, 0.1], pole: [1, 0, -0.4], facing: [0.3, 0, 1], hand: 'open' };

export const MASCOT_POSES: Record<MascotPoseName, MascotPose> = {
  idle: { right: relaxed, left: relaxed, lean: [0, 0], expression: 'happy' },
  saludo: {
    right: { wrist: [0.84, 1.08, 0.4], pole: [1, -1, -0.3], facing: [0, 1, 0], hand: 'thumbsUp' },
    left: { wrist: [0.6, 0.64, 0.12], pole: [1, 0.3, -0.5], facing: [1, 0, 0], hand: 'fist' },
    lean: [0, 0.04],
    expression: 'happy',
  },
  festejo: {
    right: { wrist: [0.78, 1.72, 0.18], pole: [1, -0.4, 0], facing: [0, 0, 1], hand: 'fist' },
    left: { wrist: [0.78, 1.72, 0.18], pole: [1, -0.4, 0], facing: [0, 0, 1], hand: 'fist' },
    lean: [-0.04, 0],
    expression: 'grin',
  },
  guino: {
    right: { wrist: [0.5, 1.02, 0.56], pole: [1, -1, 0], facing: [-1, 0, 0.3], hand: 'thumbsUp' },
    left: relaxed,
    lean: [0.03, -0.04],
    expression: 'wink',
  },
  sorpresa: {
    right: { wrist: [0.46, 1.04, 0.55], pole: [1, -1, 0], facing: [1, 0, 0.6], hand: 'open' },
    left: { wrist: [0.46, 1.04, 0.55], pole: [1, -1, 0], facing: [1, 0, 0.6], hand: 'open' },
    lean: [-0.05, 0],
    expression: 'surprised',
  },
  pensando: {
    right: { wrist: [0.12, 0.98, 0.7], pole: [1, -1, 0.3], facing: [0, 0, 1], hand: 'point' },
    left: { wrist: [-0.16, 0.56, 0.64], pole: [1, -0.6, 0.3], facing: [0, 0, 1], hand: 'fist' },
    lean: [0.03, 0.05],
    expression: 'thinking',
  },
  carta: {
    right: { wrist: [0.28, 0.96, 0.66], pole: [1, -1, 0.2], facing: [0, 1, 0.3], hand: 'point' },
    left: { wrist: [0.74, 1.34, 0.34], pole: [1, -1, 0], facing: [0, 0, 1], hand: 'open' },
    lean: [0, -0.03],
    expression: 'happy',
    prop: 'card',
  },
};
