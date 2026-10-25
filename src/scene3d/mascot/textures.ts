import * as THREE from 'three';
import { BODY } from './bodySurface';
import { MASCOT_COLORS as C, MASCOT_FONT_FAMILY } from './palette';

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement, anisotropy: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** Stylized "M" of the Megafy logo with its smile, drawn centered at (x, y). */
function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, stroke: number): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = stroke;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.42, y + h * 0.42);
  ctx.lineTo(x - w * 0.28, y - h * 0.4);
  ctx.lineTo(x, y + h * 0.12);
  ctx.lineTo(x + w * 0.28, y - h * 0.4);
  ctx.lineTo(x + w * 0.42, y + h * 0.42);
  ctx.stroke();
  ctx.strokeStyle = C.red;
  ctx.lineWidth = stroke * 0.62;
  ctx.beginPath();
  ctx.ellipse(x + w * 0.02, y + h * 0.5, w * 0.2, h * 0.17, 0, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.restore();
}

/**
 * Body skin, mapped on the lathe UVs: u = 0.5 is the front, u = 0.25 the mascot's right side,
 * v = y / height (the lathe UVs are rewritten to match).
 */
export function createBodyTexture(anisotropy = 8): THREE.CanvasTexture {
  const W = 2048;
  const H = 1024;
  const [canvas, ctx] = makeCanvas(W, H);
  const px = (u: number) => u * W;
  const py = (y: number) => (1 - y / BODY.height) * H;

  ctx.fillStyle = C.body;
  ctx.fillRect(0, 0, W, H);

  // Teal patch on the right side, under the arm.
  ctx.fillStyle = C.teal;
  ctx.beginPath();
  ctx.ellipse(px(0.25), py(0.6), 330, 255, 0, 0, Math.PI * 2);
  ctx.fill();

  // Red chevron wrapping the left side: high at the waist, down to the hem front and back.
  ctx.strokeStyle = C.red;
  ctx.lineWidth = 104;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(px(0.53), py(-0.15));
  ctx.lineTo(px(0.75), py(1.02));
  ctx.lineTo(px(0.99), py(-0.15));
  ctx.stroke();

  // Wordmark and smile on the belly.
  ctx.fillStyle = C.navy;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 118px "${MASCOT_FONT_FAMILY}", "Segoe UI", system-ui, sans-serif`;
  ctx.fillText('Megafy', px(0.5), py(0.7) + 40);
  ctx.strokeStyle = C.red;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(px(0.5) + 16, py(0.7) + 58, 34, 16, 0, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();

  return toTexture(canvas, anisotropy);
}

/** Cap crown, mapped on SphereGeometry UVs: u = 0.25 is the front, u = 0.75 the back, v = 0 the rim. */
export function createCapTexture(anisotropy = 8): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const [canvas, ctx] = makeCanvas(W, H);
  ctx.fillStyle = C.navy;
  ctx.fillRect(0, 0, W, H);

  // Panel seams.
  ctx.strokeStyle = '#16173A';
  ctx.lineWidth = 5;
  for (let k = 0; k < 6; k++) {
    const x = (0.25 + 1 / 12 + k / 6) * W;
    ctx.beginPath();
    ctx.moveTo(x % W, 0);
    ctx.lineTo(x % W, H);
    ctx.stroke();
  }

  drawLogo(ctx, 0.25 * W, 0.66 * H, 112, 132, 26);

  // Snapback: opening above the strap, at the back.
  const bx = 0.75 * W;
  ctx.fillStyle = C.body;
  ctx.beginPath();
  ctx.ellipse(bx, H - 30, 64, 130, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.red;
  ctx.fillRect(bx - 84, H - 62, 168, 46);
  ctx.fillStyle = '#9E1E1B';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.ellipse(bx + i * 26, H - 39, 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  return toTexture(canvas, anisotropy);
}

export type MouthDecal = 'smile' | 'grin' | 'o';

/** Face-space box the mouth decals are painted in, centered on the mouth's anchor height. */
export const MOUTH_DECAL = { width: 0.56, height: 0.36 } as const;

/** Open "D": the top edge sags a little so the corners turn up, the bottom is one round curve. */
function dMouthPath(w: number, top: number, depth: number, lift: number): Path2D {
  const p = new Path2D();
  p.moveTo(-w, top + lift);
  p.quadraticCurveTo(0, top - lift * 0.6, w, top + lift);
  p.bezierCurveTo(w * 0.98, top - depth * 0.8, w * 0.5, top - depth, 0, top - depth);
  p.bezierCurveTo(-w * 0.5, top - depth, -w * 0.98, top - depth * 0.8, -w, top + lift);
  p.closePath();
  return p;
}

/**
 * Open mouths as decals: a dark cavity with the tongue at the bottom. Painted in face units
 * (y up, origin at the decal's center) so the shapes match the box the decal is wrapped with.
 */
export function createMouthTexture(kind: MouthDecal, anisotropy = 8): THREE.CanvasTexture {
  const W = 512;
  const H = Math.round((W * MOUTH_DECAL.height) / MOUTH_DECAL.width);
  const [canvas, ctx] = makeCanvas(W, H);
  const s = W / MOUTH_DECAL.width;
  ctx.setTransform(s, 0, 0, -s, W / 2, H / 2);

  const shape =
    kind === 'o'
      ? { path: new Path2D(), top: 0.07, depth: 0.2, w: 0.075 }
      : kind === 'grin'
        ? { path: dMouthPath(0.25, 0.09, 0.22, 0.035), top: 0.09, depth: 0.22, w: 0.25 }
        : { path: dMouthPath(0.2, 0.08, 0.19, 0.025), top: 0.08, depth: 0.19, w: 0.2 };
  if (kind === 'o') shape.path.ellipse(0, -0.03, 0.075, 0.1, 0, 0, Math.PI * 2);
  const { path, top, depth, w } = shape;
  const bottom = top - depth;

  const cavity = ctx.createLinearGradient(0, top, 0, bottom);
  cavity.addColorStop(0, '#101233');
  cavity.addColorStop(1, C.mouth);
  ctx.fillStyle = cavity;
  ctx.fill(path);

  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = C.tongue;
  ctx.beginPath();
  ctx.ellipse(0, bottom - depth * 0.02, w * 0.64, depth * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.beginPath();
  ctx.ellipse(-w * 0.2, bottom + depth * 0.33, w * 0.16, depth * 0.07, -0.2, 0, Math.PI * 2);
  ctx.fill();
  if (kind !== 'o') {
    ctx.strokeStyle = 'rgba(185, 42, 38, 0.55)';
    ctx.lineWidth = 0.01;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, bottom + depth * 0.38);
    ctx.lineTo(0, bottom + depth * 0.12);
    ctx.stroke();
  }
  // Soft shade under the upper lip.
  const shade = ctx.createLinearGradient(0, top, 0, top - depth * 0.4);
  shade.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shade;
  ctx.fillRect(-MOUTH_DECAL.width / 2, top - depth * 0.4, MOUTH_DECAL.width, depth * 0.4 + 0.05);
  ctx.restore();

  // A crisp rim that also rounds the corners.
  ctx.strokeStyle = '#14163A';
  ctx.lineWidth = 0.014;
  ctx.lineJoin = 'round';
  ctx.stroke(path);

  return toTexture(canvas, anisotropy);
}

/** Front face of the "con carta" prop: the logo on navy. */
export function createCardTexture(anisotropy = 8): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 360);
  ctx.fillStyle = C.navy;
  ctx.fillRect(0, 0, 256, 360);
  drawLogo(ctx, 128, 160, 128, 104, 26);
  return toTexture(canvas, anisotropy);
}
