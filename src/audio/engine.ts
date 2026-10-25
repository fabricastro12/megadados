'use client';

import { useSettings } from '@/features/settings/settingsStore';

/**
 * One AudioContext per page, with a bus for effects and one for music, both following the
 * volume settings. Browsers keep audio locked until the first tap or key press; `unlock()` runs
 * on that gesture.
 */
interface Engine {
  ctx: AudioContext;
  sfx: GainNode;
  music: GainNode;
}

let engine: Engine | null = null;

function applySettings(e: Engine): void {
  const { muted, effects, music } = useSettings.getState();
  const now = e.ctx.currentTime;
  e.sfx.gain.setTargetAtTime(muted ? 0 : effects, now, 0.05);
  e.music.gain.setTargetAtTime(muted ? 0 : music * 0.45, now, 0.2);
}

export function audio(): Engine | null {
  if (typeof window === 'undefined') return null;
  if (engine) return engine;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  const master = ctx.createDynamicsCompressor();
  master.connect(ctx.destination);
  const sfx = ctx.createGain();
  const music = ctx.createGain();
  sfx.connect(master);
  music.connect(master);
  engine = { ctx, sfx, music };
  applySettings(engine);
  useSettings.subscribe(() => engine && applySettings(engine));
  return engine;
}

export function isUnlocked(): boolean {
  return engine?.ctx.state === 'running';
}

export async function unlock(): Promise<boolean> {
  const e = audio();
  if (!e) return false;
  if (e.ctx.state !== 'running') await e.ctx.resume().catch(() => undefined);
  return e.ctx.state === 'running';
}

/** Resumes audio on the first gesture anywhere on the page. */
export function unlockOnFirstGesture(): () => void {
  const handler = () => void unlock();
  const events = ['pointerdown', 'keydown'] as const;
  events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
  return () => events.forEach((e) => window.removeEventListener(e, handler));
}
