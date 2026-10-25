import * as THREE from 'three';

/** Body is a lathe whose radius follows a superellipse: a soft capsule, slightly wider at the bottom. */
export const BODY = {
  height: 2,
  radius: 0.58,
  power: 2.8,
  flare: 0.06,
  /** World height of the body's bottom (legs and shoes sit below it). */
  baseY: 0.52,
} as const;

export function bodyRadius(y: number): number {
  const t = THREE.MathUtils.clamp(y / BODY.height, 0, 1);
  const s = Math.abs(2 * t - 1);
  const shape = Math.pow(Math.max(0, 1 - Math.pow(s, BODY.power)), 1 / BODY.power);
  return BODY.radius * shape * (1 + BODY.flare * (1 - t));
}

/** Profile points bottom → top, denser near the rounded ends. */
export function bodyProfile(steps: number): THREE.Vector2[] {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (1 - Math.cos((Math.PI * i) / steps)) / 2;
    const y = t * BODY.height;
    points.push(new THREE.Vector2(bodyRadius(y), y));
  }
  return points;
}

export interface SurfaceFrame {
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

/** Point and outward normal on the body surface, in body-local space. theta = 0 faces +Z (front). */
export function surfaceFrame(y: number, theta: number): SurfaceFrame {
  const r = bodyRadius(y);
  const e = 0.002;
  const dr = (bodyRadius(y + e) - bodyRadius(y - e)) / (2 * e);
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  return {
    position: new THREE.Vector3(r * sin, y, r * cos),
    normal: new THREE.Vector3(sin, -dr, cos).normalize(),
  };
}

/**
 * Bends geometry authored flat (x right, y up, z = height above the skin) onto the body surface,
 * so face features hug the curve instead of floating in front of it.
 */
export function wrapOntoBody(geometry: THREE.BufferGeometry, anchorY: number, anchorTheta = 0): THREE.BufferGeometry {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = anchorY + position.getY(i);
    const z = position.getZ(i);
    const frame = surfaceFrame(y, anchorTheta + x / Math.max(bodyRadius(y), 0.05));
    frame.position.addScaledVector(frame.normal, z);
    position.setXYZ(i, frame.position.x, frame.position.y, frame.position.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
