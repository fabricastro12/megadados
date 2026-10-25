import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
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

/** Flattened ellipsoid authored in face space, wrapped onto the body. */
function blob(rx: number, ry: number, depth: number, x: number, y: number, z: number, q: MascotQuality): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg(28, q), seg(16, q));
  g.scale(rx, ry, depth);
  g.translate(x, y, z);
  return wrapOntoBody(g, 0);
}

function stroke(points: THREE.Vector3[], radius: number, q: MascotQuality): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, seg(24, q), radius, seg(8, q), false);
  return wrapOntoBody(g, 0);
}

function roundCap(position: THREE.Vector3, radius: number, q: MascotQuality): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(radius, seg(10, q), seg(8, q));
  g.translate(position.x, position.y, position.z);
  return wrapOntoBody(g, 0);
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

  // Brim: a thick crescent in front of the crown, pre-curved down at the sides.
  const inner = rim - 0.02;
  const brim = new THREE.Shape();
  brim.moveTo(inner + 0.05, 0);
  brim.absellipse(0, 0, inner + 0.05, 0.86, 0, Math.PI, false, 0);
  brim.lineTo(-inner, 0);
  brim.absarc(0, 0, inner, Math.PI, 0, true);
  const brimGeo = new THREE.ExtrudeGeometry(brim, {
    depth: 0.045,
    curveSegments: seg(48, q),
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 4,
  });
  brimGeo.rotateX(Math.PI / 2);
  const p = brimGeo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    // Down at the sides, and the bill tips down toward its edge.
    p.setY(i, p.getY(i) - 0.5 * x * x - 0.14 * Math.max(0, z - 0.45));
  }
  brimGeo.computeVertexNormals();
  const brimMesh = mesh(brimGeo, mat.red);
  brimMesh.position.y = -0.012;
  cap.add(brimMesh);
  // A darker copy a hair lower reads as the brim's underside.
  const under = mesh(brimGeo, mat.redShade, false);
  under.position.y = -0.02;
  under.scale.set(0.99, 1, 0.99);
  cap.add(under);

  cap.position.set(0, CAP.rimY, -0.01);
  cap.rotation.set(-0.06, 0.06, 0);
  return cap;
}

// --- Limbs ------------------------------------------------------------------------------------

function capsule(radius: number, length: number, q: MascotQuality): THREE.CapsuleGeometry {
  return new THREE.CapsuleGeometry(radius, length, seg(6, q), seg(16, q));
}

function createHand(kind: MascotHand, mat: MascotMaterials, q: MascotQuality): THREE.Group {
  const hand = new THREE.Group();
  const add = (g: THREE.BufferGeometry) => hand.add(mesh(g, mat.limb));
  const closed = kind !== 'open';
  // Puffy glove: a big rounded palm with chunky fingers.
  const palm = new THREE.SphereGeometry(0.15, seg(24, q), seg(16, q));
  palm.scale(closed ? 1.05 : 1, closed ? 0.95 : 1.05, closed ? 0.88 : 0.72);
  palm.translate(0, -0.13, 0);
  add(palm);

  if (kind === 'open') {
    [-0.085, -0.03, 0.03, 0.085].forEach((x, i) => {
      const f = capsule(0.05, 0.08, q);
      f.rotateZ((i - 1.5) * 0.13);
      f.rotateX(0.15);
      f.translate(x, -0.3, 0.01);
      add(f);
    });
    const thumb = capsule(0.055, 0.08, q);
    thumb.rotateX(-0.9);
    thumb.translate(0, -0.11, 0.13);
    add(thumb);
    return hand;
  }

  // Closed hands: knuckles on top, curled fingers rolling down the front.
  [-0.08, -0.027, 0.027, 0.08].forEach((x) => {
    const knuckle = new THREE.SphereGeometry(0.055, seg(12, q), seg(10, q));
    knuckle.translate(x, -0.235, 0.05);
    add(knuckle);
    const curl = new THREE.SphereGeometry(0.05, seg(12, q), seg(10, q));
    curl.translate(x, -0.18, 0.115);
    add(curl);
  });
  if (kind === 'fist') {
    const thumb = capsule(0.05, 0.08, q);
    thumb.rotateZ(Math.PI / 2);
    thumb.translate(0.02, -0.11, 0.135);
    add(thumb);
  }
  if (kind === 'thumbsUp') {
    // Sticks out of the knuckle side (+Z), so the pose's `facing` aims it.
    const thumb = capsule(0.062, 0.1, q);
    thumb.rotateX(Math.PI / 2);
    thumb.translate(0.0, -0.21, 0.2);
    add(thumb);
  }
  if (kind === 'point') {
    const index = capsule(0.05, 0.15, q);
    index.translate(0.0, -0.35, 0.03);
    add(index);
    const thumb = capsule(0.05, 0.07, q);
    thumb.rotateZ(Math.PI / 2);
    thumb.translate(0.02, -0.12, 0.135);
    add(thumb);
  }
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
    open: createHand('open', mat, q),
    fist: createHand('fist', mat, q),
    thumbsUp: createHand('thumbsUp', mat, q),
    point: createHand('point', mat, q),
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
