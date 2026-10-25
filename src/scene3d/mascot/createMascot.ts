import * as THREE from 'three';
import { BODY } from './bodySurface';
import {
  type ArmRig,
  type FaceRig,
  type MascotQuality,
  FOREARM,
  UPPER_ARM,
  createArm,
  createBody,
  createCap,
  createCard,
  createFace,
  createLeg,
  createMaterials,
} from './parts';
import { type ArmPose, type MascotExpression, type MascotPoseName, MASCOT_POSES } from './poses';

export interface MascotOptions {
  /** 'low' halves curve detail for phones and the light mode. */
  quality?: 'high' | 'low';
}

export interface Mascot {
  /** Feet at y = 0, about 2.75 units tall, facing +Z. */
  root: THREE.Group;
  setPose(name: MascotPoseName, immediate?: boolean): void;
  setExpression(expression: MascotExpression): void;
  /** Call every frame with the frame delta and the elapsed time, both in seconds. */
  update(delta: number, elapsed: number): void;
  dispose(): void;
}

interface FaceState {
  eyes: keyof FaceRig['eyes'];
  brows: keyof FaceRig['brows'];
  mouth: keyof FaceRig['mouths'];
  winkRight?: boolean;
}

const EXPRESSIONS: Record<MascotExpression, FaceState> = {
  happy: { eyes: 'open', brows: 'normal', mouth: 'smile' },
  grin: { eyes: 'open', brows: 'raised', mouth: 'grin' },
  wink: { eyes: 'open', brows: 'normal', mouth: 'smile', winkRight: true },
  surprised: { eyes: 'wide', brows: 'up', mouth: 'o' },
  thinking: { eyes: 'up', brows: 'flat', mouth: 'line' },
};

const POSE_SPEED = 9;

/** Arm goal in torso space, mirrored for the right arm. */
interface ArmGoal {
  wrist: THREE.Vector3;
  pole: THREE.Vector3;
  facing: THREE.Vector3;
}

function goalFor(arm: ArmRig, pose: ArmPose): ArmGoal {
  const m = (v: readonly [number, number, number]) => new THREE.Vector3(v[0] * arm.side, v[1], v[2]);
  return { wrist: m(pose.wrist), pole: m(pose.pole).normalize(), facing: m(pose.facing).normalize() };
}

const basis = new THREE.Matrix4();
const ax = new THREE.Vector3();
const ay = new THREE.Vector3();
const az = new THREE.Vector3();

/** Orientation whose -Y runs along `dir` (limbs hang along -Y) and whose +Z leans toward `facing`. */
function boneFrame(dir: THREE.Vector3, facing: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  ay.copy(dir).negate();
  az.copy(facing).addScaledVector(ay, -facing.dot(ay));
  if (az.lengthSq() < 1e-6) az.set(0, 0, 1).addScaledVector(ay, -ay.z);
  az.normalize();
  ax.crossVectors(ay, az);
  basis.makeBasis(ax, ay, az);
  return out.setFromRotationMatrix(basis);
}

const toWrist = new THREE.Vector3();
const bend = new THREE.Vector3();
const elbowPos = new THREE.Vector3();
const upperDir = new THREE.Vector3();
const foreDir = new THREE.Vector3();
const qUpper = new THREE.Quaternion();
const qFore = new THREE.Quaternion();

/** Analytic two-bone IK: places the shoulder and elbow so the wrist reaches the goal. */
function solveArm(arm: ArmRig, goal: ArmGoal): void {
  const a = UPPER_ARM;
  const b = FOREARM;
  toWrist.subVectors(goal.wrist, arm.shoulder.position);
  const reach = THREE.MathUtils.clamp(toWrist.length(), Math.abs(a - b) + 0.01, a + b - 0.002);
  toWrist.normalize();
  const cos = (a * a + reach * reach - b * b) / (2 * a * reach);
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  bend.copy(goal.pole).addScaledVector(toWrist, -goal.pole.dot(toWrist));
  if (bend.lengthSq() < 1e-6) bend.set(0, -1, 0);
  bend.normalize();
  elbowPos.copy(arm.shoulder.position).addScaledVector(toWrist, a * cos).addScaledVector(bend, a * sin);
  upperDir.subVectors(elbowPos, arm.shoulder.position).normalize();
  foreDir.copy(arm.shoulder.position).addScaledVector(toWrist, reach).sub(elbowPos).normalize();
  boneFrame(upperDir, goal.facing, qUpper);
  boneFrame(foreDir, goal.facing, qFore);
  arm.shoulder.quaternion.copy(qUpper);
  arm.elbow.quaternion.copy(qUpper.invert().multiply(qFore));
}

export function createMascot(options: MascotOptions = {}): Mascot {
  const quality: MascotQuality = options.quality === 'low' ? { detail: 0.5, anisotropy: 2 } : { detail: 1, anisotropy: 8 };
  const mat = createMaterials(quality);

  const root = new THREE.Group();
  root.name = 'MegafyMascot';

  const torso = new THREE.Group();
  torso.position.y = BODY.baseY;
  root.add(torso);
  torso.add(createBody(mat, quality));

  const face = createFace(mat, quality);
  torso.add(face.root);
  torso.add(createCap(mat, quality));

  const right = createArm(-1, mat, quality);
  const left = createArm(1, mat, quality);
  torso.add(right.shoulder, left.shoulder);

  root.add(createLeg(-1, mat, quality), createLeg(1, mat, quality));

  const card = createCard(mat, quality);
  card.position.set(0, -0.36, 0.06);
  // The hand points up while holding it, so the card hangs upside down in wrist space.
  card.rotation.z = Math.PI;
  left.wrist.add(card);

  const arms = [right, left] as const;
  let poseName: MascotPoseName = 'idle';
  const current = arms.map((arm) => goalFor(arm, MASCOT_POSES.idle.left));
  let targets = arms.map((arm) => goalFor(arm, MASCOT_POSES.idle.left));
  let lean = MASCOT_POSES.idle.lean;
  let expression: MascotExpression = 'happy';
  let blinkAt = 2.5;
  let blinking = 0;

  function showFace(state: FaceState, blink: boolean): void {
    for (const [name, [r, l]] of Object.entries(face.eyes)) {
      const closed = name === 'closed';
      r.visible = blink || state.winkRight ? closed : name === state.eyes;
      l.visible = blink ? closed : name === state.eyes;
    }
    for (const [name, [r, l]] of Object.entries(face.brows)) {
      r.visible = name === state.brows;
      l.visible = name === (state.brows === 'flat' ? 'raised' : state.brows);
    }
    for (const [name, m] of Object.entries(face.mouths)) m.visible = name === state.mouth;
  }

  function applyHands(): void {
    const pose = MASCOT_POSES[poseName];
    const handFor = [pose.right.hand, pose.left.hand];
    arms.forEach((arm, i) => {
      for (const [name, hand] of Object.entries(arm.hands)) hand.visible = name === handFor[i];
    });
    card.visible = pose.prop === 'card';
  }

  const mascot: Mascot = {
    root,
    setPose(name, immediate = false) {
      poseName = name;
      const pose = MASCOT_POSES[name];
      targets = [goalFor(right, pose.right), goalFor(left, pose.left)];
      lean = pose.lean;
      applyHands();
      mascot.setExpression(pose.expression);
      if (immediate) {
        arms.forEach((arm, i) => {
          const c = current[i]!;
          const t = targets[i]!;
          c.wrist.copy(t.wrist);
          c.pole.copy(t.pole);
          c.facing.copy(t.facing);
          solveArm(arm, c);
        });
        torso.rotation.set(lean[0], 0, -lean[1]);
      }
    },
    setExpression(next) {
      expression = next;
      showFace(EXPRESSIONS[next], false);
    },
    update(delta, elapsed) {
      const k = 1 - Math.exp(-POSE_SPEED * delta);
      arms.forEach((arm, i) => {
        const c = current[i]!;
        const t = targets[i]!;
        c.wrist.lerp(t.wrist, k);
        c.pole.lerp(t.pole, k).normalize();
        c.facing.lerp(t.facing, k).normalize();
        solveArm(arm, c);
      });
      torso.rotation.x = THREE.MathUtils.lerp(torso.rotation.x, lean[0], k);
      torso.rotation.z = THREE.MathUtils.lerp(torso.rotation.z, -lean[1], k);

      // Idle life: a soft bob and squash, plus a blink every few seconds.
      const bob = Math.sin(elapsed * 2.2);
      torso.position.y = BODY.baseY + bob * 0.015;
      torso.scale.set(1 - bob * 0.008, 1 + bob * 0.012, 1 - bob * 0.008);

      if (blinking > 0) {
        blinking -= delta;
        if (blinking <= 0) showFace(EXPRESSIONS[expression], false);
      } else if (elapsed > blinkAt && expression !== 'wink') {
        blinking = 0.13;
        blinkAt = elapsed + 2.5 + Math.random() * 2.5;
        showFace(EXPRESSIONS[expression], true);
      }
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const m of Object.values(mat)) {
        if ('map' in m && m.map) m.map.dispose();
        m.dispose();
      }
    },
  };

  mascot.setPose('idle', true);
  return mascot;
}
