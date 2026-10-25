import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { BODY, bodyProfile, bodyRadius, wrapOntoBody } from './bodySurface';
import { MASCOT_COLORS as C } from './palette';
import type { MascotHand } from './poses';
import { type MouthDecal, MOUTH_DECAL, createBodyTexture, createCapTexture, createCardTexture, createMouthTexture } from './textures';

export interface MascotQuality {
  /** Multiplier for curved-surface segment counts. */
  detail: number;
  anisotropy: number;
}

export function createMaterials(quality: MascotQuality) {
  // Soft vinyl: a low sheen lifts the silhouette's edges, a thin clearcoat adds the toy gloss.
  const vinyl = { roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.45, sheen: 0.35, sheenRoughness: 0.6, sheenColor: '#FFFFFF' };
  // Cap twill and sneaker canvas: sheen is the fabric term of the physical material.
  const fabric = (color: string, sheenColor: string) =>
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.85, sheen: 1, sheenRoughness: 0.5, sheenColor });
  const decal = (kind: MouthDecal) =>
    new THREE.MeshStandardMaterial({
      map: createMouthTexture(kind, quality.anisotropy),
      roughness: 0.4,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  const cap = fabric('#FFFFFF', '#6A6FA8');
  cap.map = createCapTexture(quality.anisotropy);
  cap.side = THREE.DoubleSide;
  return {
    skin: new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', map: createBodyTexture(quality.anisotropy), ...vinyl }),
    limb: new THREE.MeshPhysicalMaterial({ color: C.body, ...vinyl }),
    cap,
    navy: new THREE.MeshStandardMaterial({ color: C.navy, roughness: 0.75 }),
    canvas: fabric(C.navy, '#5D62A0'),
    red: fabric(C.red, '#FF9A90'),
    redShade: fabric(C.redShade, '#E0625C'),
    sole: new THREE.MeshStandardMaterial({ color: C.sole, roughness: 0.7 }),
    mouthSmile: decal('smile'),
    mouthGrin: decal('grin'),
    mouthO: decal('o'),
    sclera: new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.25, clearcoat: 0.6 }),
    pupil: new THREE.MeshPhysicalMaterial({ color: C.pupil, roughness: 0.2, clearcoat: 1 }),
    shine: new THREE.MeshBasicMaterial({ color: '#FFFFFF' }),
    card: new THREE.MeshStandardMaterial({ map: createCardTexture(quality.anisotropy), roughness: 0.6 }),
  };
}

export type MascotMaterials = ReturnType<typeof createMaterials>;

const seg = (base: number, q: MascotQuality) => Math.max(6, Math.round(base * q.detail));

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

export function createBody(mat: MascotMaterials, q: MascotQuality): THREE.Mesh {
  const geometry = new THREE.LatheGeometry(bodyProfile(seg(48, q)), seg(72, q), Math.PI);
  // Lathe v follows point index; rewrite it to y / height so the skin texture is painted in body units.
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setY(i, position.getY(i) / BODY.height);
  uv.needsUpdate = true;
  return mesh(geometry, mat.skin);
}

// --- Face -------------------------------------------------------------------------------------

/**
 * Shares the seam and pole vertices that built-in shapes duplicate, so the normals the wrap
 * recomputes stay continuous instead of showing a crease in the highlights.
 */
function weld(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const welded = BufferGeometryUtils.mergeVertices(g);
  g.dispose();
  return welded;
}

/**
 * Flattened ellipsoid authored in face space, wrapped onto the body. Its poles point out of the
 * skin, so the outline seen from the front is the finely divided equator rather than a meridian.
 */
function blob(rx: number, ry: number, depth: number, x: number, y: number, z: number, q: MascotQuality): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg(64, q), seg(14, q));
  g.rotateX(Math.PI / 2);
  g.scale(rx, ry, depth);
  g.translate(x, y, z);
  return wrapOntoBody(weld(g), 0);
}

function stroke(points: THREE.Vector3[], radius: number, q: MascotQuality): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, seg(40, q), radius, seg(16, q), false);
  return wrapOntoBody(weld(g), 0);
}

function roundCap(position: THREE.Vector3, radius: number, q: MascotQuality): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(radius, seg(16, q), seg(12, q));
  g.translate(position.x, position.y, position.z);
  return wrapOntoBody(weld(g), 0);
}

function strokeWithCaps(group: THREE.Group, points: THREE.Vector3[], radius: number, material: THREE.Material, q: MascotQuality): void {
  group.add(mesh(stroke(points, radius, q), material, false));
  group.add(mesh(roundCap(points[0]!, radius, q), material, false));
  group.add(mesh(roundCap(points[points.length - 1]!, radius, q), material, false));
}

type EyeState = 'open' | 'wide' | 'up' | 'closed';
const EYE_Y = 1.3;
const EYE_X = 0.245;

function createEye(state: EyeState, side: 1 | -1, mat: MascotMaterials, q: MascotQuality): THREE.Group {
  const g = new THREE.Group();
  const cx = side * EYE_X;
  if (state === 'closed') {
    const p = (dx: number, dy: number) => new THREE.Vector3(cx + dx, EYE_Y + dy, 0.02);
    strokeWithCaps(g, [p(-0.11, -0.02), p(-0.05, 0.035), p(0.05, 0.035), p(0.11, -0.02)], 0.028, mat.navy, q);
    return g;
  }
  const wide = state === 'wide';
  const rx = wide ? 0.16 : 0.15;
  const ry = wide ? 0.2 : 0.185;
  // A thin dark rim around a white, domed sclera. The rim stays low so the dome covers it
  // almost to its edge and only a fine line shows.
  g.add(mesh(blob(rx + 0.007, ry + 0.008, 0.018, cx, EYE_Y, 0, q), mat.navy, false));
  g.add(mesh(blob(rx, ry, 0.056, cx, EYE_Y, 0, q), mat.sclera, false));
  const pr = wide ? 0.085 : 0.108;
  const look = state === 'up' ? new THREE.Vector2(0.035, 0.06) : new THREE.Vector2(-side * 0.012, -0.022);
  const px = cx + look.x;
  const py = EYE_Y + look.y;
  g.add(mesh(blob(pr, pr * 1.3, 0.068, px, py, 0, q), mat.pupil, false));
  g.add(mesh(blob(0.034, 0.038, 0.078, px + 0.036, py + 0.052, 0, q), mat.shine, false));
  g.add(mesh(blob(0.016, 0.018, 0.078, px - 0.04, py - 0.058, 0, q), mat.shine, false));
  return g;
}

type BrowState = 'normal' | 'raised' | 'up' | 'flat';

function createBrow(state: BrowState, side: 1 | -1, mat: MascotMaterials, q: MascotQuality): THREE.Group {
  const g = new THREE.Group();
  // Kept small: the brim sits right above the brows.
  const lift = state === 'raised' ? 0.022 : state === 'up' ? 0.032 : state === 'flat' ? -0.015 : 0;
  const arch = state === 'flat' ? 0.0 : state === 'raised' || state === 'up' ? 0.04 : 0.03;
  const cx = side * (EYE_X + 0.01);
  const y = 1.552 + lift;
  // dx grows outward from the face's center line; the outer end sits lower.
  const p = (dx: number, dy: number) => new THREE.Vector3(cx + side * dx, y + dy, 0.024);
  const tilt = state === 'flat' ? 0.02 : 0;
  strokeWithCaps(g, [p(-0.085, -0.004 + tilt), p(0, arch), p(0.085, -0.032 - tilt)], 0.034, mat.navy, q);
  return g;
}

type MouthState = 'smile' | 'grin' | 'o' | 'line';
const MOUTH_Y = 1.02;

/**
 * Open mouths are painted decals on a finely divided plane. Flat extruded caps triangulate into a
 * few long triangles that the wrap can only bend at their corners, so their middle sank under the skin.
 */
function mouthDecal(material: THREE.Material, q: MascotQuality): THREE.Mesh {
  const g = new THREE.PlaneGeometry(MOUTH_DECAL.width, MOUTH_DECAL.height, seg(32, q), seg(20, q));
  g.translate(0, MOUTH_Y, 0.004);
  const m = mesh(wrapOntoBody(g, 0), material, false);
  m.receiveShadow = true;
  return m;
}

function createMouth(state: MouthState, mat: MascotMaterials, q: MascotQuality): THREE.Group {
  const g = new THREE.Group();
  if (state === 'line') {
    const p = (x: number, y: number) => new THREE.Vector3(x, MOUTH_Y + y, 0.02);
    strokeWithCaps(g, [p(-0.08, -0.01), p(0, 0.012), p(0.08, 0.03)], 0.022, mat.navy, q);
    return g;
  }
  g.add(mouthDecal(state === 'o' ? mat.mouthO : state === 'grin' ? mat.mouthGrin : mat.mouthSmile, q));
  return g;
}

export interface FaceRig {
  root: THREE.Group;
  eyes: Record<EyeState, [THREE.Group, THREE.Group]>;
  brows: Record<BrowState, [THREE.Group, THREE.Group]>;
  mouths: Record<MouthState, THREE.Group>;
}

export function createFace(mat: MascotMaterials, q: MascotQuality): FaceRig {
  const root = new THREE.Group();
  const pair = <S extends string>(make: (s: S, side: 1 | -1) => THREE.Group, state: S): [THREE.Group, THREE.Group] => {
    const right = make(state, -1);
    const left = make(state, 1);
    root.add(right, left);
    return [right, left];
  };
  const eye = (s: EyeState, side: 1 | -1) => createEye(s, side, mat, q);
  const brow = (s: BrowState, side: 1 | -1) => createBrow(s, side, mat, q);
  const eyes = {
    open: pair(eye, 'open'),
    wide: pair(eye, 'wide'),
    up: pair(eye, 'up'),
    closed: pair(eye, 'closed'),
  };
  const brows = {
    normal: pair(brow, 'normal'),
    raised: pair(brow, 'raised'),
    up: pair(brow, 'up'),
    flat: pair(brow, 'flat'),
  };
  const mouths = {
    smile: createMouth('smile', mat, q),
    grin: createMouth('grin', mat, q),
    o: createMouth('o', mat, q),
    line: createMouth('line', mat, q),
  };
  root.add(mouths.smile, mouths.grin, mouths.o, mouths.line);
  return { root, eyes, brows, mouths };
}

// --- Cap --------------------------------------------------------------------------------------

/** The crown's rim sits on the head where the body is this high, and rises this far above it. */
const CAP = { rimY: 1.75, height: 0.43, power: 2.15, ease: 0.04 } as const;

/**
 * Crown profile, rim → top: a superellipse dome whose rim hugs the head with a little ease,
 * so no skin shows between the crown and the brim.
 */
function crownProfile(steps: number): THREE.Vector2[] {
  const rim = bodyRadius(CAP.rimY) + CAP.ease;
  const e = 2 / CAP.power;
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const phi = (Math.PI / 2) * (i / steps);
    points.push(new THREE.Vector2(rim * Math.pow(Math.cos(phi), e), CAP.height * Math.pow(Math.sin(phi), e)));
  }
  points[steps]!.x = 0;
  return points;
}

const BRIM = { reach: 0.84, flare: 0.045, thickness: 0.07 } as const;

/**
 * One face of the brim (face = 1 top, -1 underside) as a dense grid over a crescent in front of
 * the crown: angle θ runs side to side, v from just inside the crown wall to the bill's edge.
 * A grid lets the bend follow every point; an extruded shape triangulates into long triangles
 * that cut straight through the curve.
 */
function brimSurface(rim: number, face: 1 | -1, q: MascotQuality): THREE.BufferGeometry {
  const inner = rim - 0.02;
  const side = rim + BRIM.flare;
  const cols = seg(56, q);
  const rows = seg(18, q);
  const positions: number[] = [];
  for (let i = 0; i <= cols; i++) {
    const theta = Math.PI * (i / cols - 0.5);
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    const edge = 1 / Math.hypot(sin / side, cos / BRIM.reach);
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      const r = inner + v * (edge - inner);
      const x = r * sin;
      const z = r * cos;
      // t grows with the distance past the crown wall (1 at the front edge): the bend grows with
      // it, so the brim is flush with the crown where they meet and only the bill curves down.
      // Absolute distance keeps the narrow side tips nearly flat instead of plunging into the head.
      const t = THREE.MathUtils.clamp((r - rim) / (BRIM.reach - rim), 0, 1);
      const mid = -BRIM.thickness / 2 - t * (0.7 * x * x + 0.1 * t);
      // Half thickness closes to zero at the outer edge (a rounded lip) and at both tips.
      // Clamped: at the edges rounding pushes these a hair past 1, and the square roots go NaN.
      const lip = THREE.MathUtils.clamp((v - 0.82) / 0.18, 0, 1);
      const tip = THREE.MathUtils.clamp((Math.abs(theta) / (Math.PI / 2) - 0.9) / 0.1, 0, 1);
      const half = (BRIM.thickness / 2) * Math.sqrt(1 - lip * lip) * Math.sqrt(1 - tip * tip);
      positions.push(x, mid + face * half, z);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j;
      const b = a + rows + 1;
      // Winding so the top faces up and the underside faces down.
      if (face === 1) index.push(a, a + 1, b, b, a + 1, b + 1);
      else index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export function createCap(mat: MascotMaterials, q: MascotQuality): THREE.Group {
  const cap = new THREE.Group();
  const rim = bodyRadius(CAP.rimY) + CAP.ease;
  // phiStart -π/2 puts u = 0.25 at the front and v = 0 at the rim, as the cap texture expects.
  const crown = new THREE.LatheGeometry(crownProfile(seg(28, q)), seg(64, q), -Math.PI / 2);
  cap.add(mesh(crown, mat.cap));

  const button = new THREE.SphereGeometry(0.055, seg(16, q), seg(8, q));
  button.scale(1, 0.55, 1);
  button.translate(0, CAP.height - 0.004, 0);
  cap.add(mesh(button, mat.canvas));

  // Brim: the top in red, the underside a shade darker, meeting at a rounded edge.
  cap.add(mesh(brimSurface(rim, 1, q), mat.red));
  cap.add(mesh(brimSurface(rim, -1, q), mat.redShade));

  cap.position.set(0, CAP.rimY, -0.01);
  cap.rotation.set(-0.06, 0.06, 0);
  return cap;
}

// --- Limbs ------------------------------------------------------------------------------------

function capsule(radius: number, length: number, q: MascotQuality): THREE.CapsuleGeometry {
  return new THREE.CapsuleGeometry(radius, length, seg(6, q), seg(16, q));
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Capsule running from a to b: one finger segment. Chained segments of one radius bend smoothly. */
function bone(a: THREE.Vector3, b: THREE.Vector3, radius: number, q: MascotQuality): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CapsuleGeometry(radius, dir.length(), seg(6, q), seg(18, q));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

function ellipsoid(rx: number, ry: number, rz: number, center: THREE.Vector3, q: MascotQuality): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg(32, q), seg(20, q));
  g.scale(rx, ry, rz);
  g.translate(center.x, center.y, center.z);
  return g;
}

/**
 * Cartoon glove in wrist space: the hand hangs along -Y, the palm (where fingers curl) faces +Z
 * and the thumb sits on the side·X edge, so the left and right hands mirror each other.
 * Fingers run index → pinky away from the thumb. Each hand is merged into one mesh.
 */
function createHand(kind: MascotHand, side: 1 | -1, mat: MascotMaterials, q: MascotQuality): THREE.Group {
  const parts: THREE.BufferGeometry[] = [];
  const fingerX = [0.096, 0.032, -0.032, -0.096].map((x) => side * x);
  const radius = [0.043, 0.044, 0.042, 0.038];
  const curled = (i: number) => {
    // Knuckle → around the bottom of the fist → fingertip tucked against the palm.
    const x = fingerX[i]!;
    const r = radius[i]!;
    parts.push(bone(v3(x, -0.19, -0.02), v3(x, -0.255, 0.035), r, q));
    parts.push(bone(v3(x, -0.255, 0.035), v3(x * 0.95, -0.205, 0.1), r, q));
  };
  const straight = (i: number, length: number, spread: number, curl: number) => {
    const x = fingerX[i]!;
    const base = v3(x, -0.2, 0);
    const mid = v3(x * (1 + spread * 0.5), -0.2 - length * 0.55, curl * 0.4);
    const tip = v3(x * (1 + spread), -0.2 - length, curl);
    parts.push(bone(base, mid, radius[i]!, q), bone(mid, tip, radius[i]! * 0.96, q));
  };

  if (kind === 'open') {
    parts.push(ellipsoid(0.135, 0.125, 0.072, v3(0, -0.13, 0), q));
    [0.11, 0.125, 0.115, 0.09].forEach((length, i) => straight(i, length, 0.4, 0.035));
    parts.push(bone(v3(side * 0.09, -0.09, 0.02), v3(side * 0.205, -0.165, 0.075), 0.046, q));
  } else {
    parts.push(ellipsoid(0.13, 0.115, 0.098, v3(0, -0.12, 0), q));
    if (kind === 'point') straight(0, 0.17, 0, 0.01);
    else curled(0);
    for (let i = 1; i < 4; i++) curled(i);
    if (kind === 'thumbsUp') {
      // Out of the top of the fist along side·X, square to the forearm.
      parts.push(bone(v3(side * 0.09, -0.1, 0.03), v3(side * 0.25, -0.075, 0.03), 0.05, q));
    } else {
      // Wrapped across the front of the curled fingers.
      parts.push(bone(v3(side * 0.12, -0.12, 0.06), v3(side * 0.015, -0.165, 0.14), 0.046, q));
    }
  }

  const geometry = BufferGeometryUtils.mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const hand = new THREE.Group();
  hand.add(mesh(geometry, mat.limb));
  return hand;
}

export interface ArmRig {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  wrist: THREE.Group;
  hands: Record<MascotHand, THREE.Group>;
  side: 1 | -1;
}

const SHOULDER_Y = 1.0;
export const UPPER_ARM = 0.26;
export const FOREARM = 0.24;
/** Arm thickness at the shoulder, elbow and wrist. */
const ARM_RADII = [0.138, 0.128, 0.118] as const;

/** Open tube hanging along -Y from r0 at the joint to r1 at the next one. */
function taperedLimb(r0: number, r1: number, length: number, q: MascotQuality): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r0, r1, length, seg(20, q), 1, true);
  g.translate(0, -length / 2, 0);
  return g;
}

export function createArm(side: 1 | -1, mat: MascotMaterials, q: MascotQuality): ArmRig {
  const shoulder = new THREE.Group();
  const theta = 0.22;
  const r = bodyRadius(SHOULDER_Y) - 0.04;
  shoulder.position.set(side * r * Math.cos(theta), SHOULDER_Y, r * Math.sin(theta));
  // One smooth, slightly tapered tube: each joint ball has the radius of the segments it joins,
  // so the arm bends without lumps or creases.
  const joint = (radius: number) => mesh(new THREE.SphereGeometry(radius, seg(20, q), seg(14, q)), mat.limb);
  shoulder.add(joint(ARM_RADII[0]), mesh(taperedLimb(ARM_RADII[0], ARM_RADII[1], UPPER_ARM, q), mat.limb));

  const elbow = new THREE.Group();
  elbow.position.y = -UPPER_ARM;
  shoulder.add(elbow);
  elbow.add(joint(ARM_RADII[1]), mesh(taperedLimb(ARM_RADII[1], ARM_RADII[2], FOREARM, q), mat.limb));

  const wrist = new THREE.Group();
  wrist.position.y = -FOREARM;
  elbow.add(wrist);
  wrist.add(joint(ARM_RADII[2]));
  const hands = {
    open: createHand('open', side, mat, q),
    fist: createHand('fist', side, mat, q),
    thumbsUp: createHand('thumbsUp', side, mat, q),
    point: createHand('point', side, mat, q),
  };
  wrist.add(hands.open, hands.fist, hands.thumbsUp, hands.point);
  return { shoulder, elbow, wrist, hands, side };
}

export function createLeg(side: 1 | -1, mat: MascotMaterials, q: MascotQuality): THREE.Group {
  const leg = new THREE.Group();
  leg.position.x = side * 0.29;
  const shin = capsule(0.13, 0.2, q);
  shin.translate(0, 0.43, 0);
  leg.add(mesh(shin, mat.limb));

  // Sneaker: a puffy canvas upper (a capsule lying along Z, so the toe and heel are round) on a
  // thick rubber sole, with three laces across the instep.
  const upperShoe = new THREE.CapsuleGeometry(0.16, 0.26, seg(8, q), seg(24, q));
  upperShoe.rotateX(Math.PI / 2);
  // Its widest line rests on the sole, so the sole reads as a lip instead of a plate.
  upperShoe.scale(1.16, 0.88, 1);
  upperShoe.translate(0, 0.13, 0.07);
  leg.add(mesh(upperShoe, mat.canvas));
  // Same pill footprint as the upper, a touch larger, flattened into a rubber sole.
  const sole = new THREE.CapsuleGeometry(0.172, 0.27, seg(6, q), seg(24, q));
  sole.rotateX(Math.PI / 2);
  sole.scale(1.18, 0.32, 1);
  sole.translate(0, 0.055, 0.07);
  leg.add(mesh(sole, mat.sole));
  [0.05, 0.12, 0.19].forEach((z, i) => {
    const lace = capsule(0.02, 0.15 - i * 0.012, q);
    lace.rotateZ(Math.PI / 2);
    lace.translate(0, 0.276, z);
    leg.add(mesh(lace, mat.sole));
  });
  return leg;
}

export function createCard(mat: MascotMaterials, q: MascotQuality): THREE.Group {
  const card = new THREE.Group();
  card.add(mesh(new RoundedBoxGeometry(0.34, 0.48, 0.03, seg(2, q), 0.03), mat.navy));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.42), mat.card);
  face.position.z = 0.017;
  card.add(face);
  return card;
}
