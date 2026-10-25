'use client';

import { audio } from './engine';

type Wave = OscillatorType;

/** One enveloped oscillator note on the effects bus. */
function tone(freq: number, at: number, length: number, opts: { wave?: Wave; volume?: number; slideTo?: number; attack?: number } = {}): void {
  const e = audio();
  if (!e || e.ctx.state !== 'running') return;
  const { ctx } = e;
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.wave ?? 'triangle';
  osc.frequency.setValueAtTime(freq, start);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, start + length);
  const peak = opts.volume ?? 0.3;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + (opts.attack ?? 0.008));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(e.sfx);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

/** A burst of filtered noise: whooshes and claps. */
function noise(at: number, length: number, opts: { from: number; to: number; volume?: number; q?: number }): void {
  const e = audio();
  if (!e || e.ctx.state !== 'running') return;
  const { ctx } = e;
  const start = ctx.currentTime + at;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = opts.q ?? 1.2;
  filter.frequency.setValueAtTime(opts.from, start);
  filter.frequency.exponentialRampToValueAtTime(opts.to, start + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(opts.volume ?? 0.25, start + length * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  src.connect(filter).connect(gain).connect(e.sfx);
  src.start(start);
}

const NOTE = (semitones: number) => 440 * 2 ** (semitones / 12);

/** Every sound in the game, synthesized: no audio files, nothing to license. */
export const sfx = {
  /** A peg passing the wheel's pointer. */
  tick: () => tone(1800, 0, 0.03, { wave: 'square', volume: 0.08 }),
  spin: () => noise(0, 0.6, { from: 400, to: 2400, volume: 0.2 }),
  pop: () => tone(520, 0, 0.12, { wave: 'sine', volume: 0.25, slideTo: 1040 }),
  /** The last seconds of a question. */
  beep: (last = false) => tone(last ? 1320 : 880, 0, last ? 0.25 : 0.09, { wave: 'square', volume: 0.12 }),
  select: () => tone(660, 0, 0.08, { wave: 'triangle', volume: 0.2 }),
  correct: () => {
    tone(NOTE(3), 0, 0.14, { volume: 0.28 });
    tone(NOTE(7), 0.09, 0.14, { volume: 0.28 });
    tone(NOTE(10), 0.18, 0.32, { volume: 0.3 });
  },
  wrong: () => {
    tone(196, 0, 0.18, { wave: 'sawtooth', volume: 0.14, slideTo: 150 });
    tone(147, 0.16, 0.34, { wave: 'sawtooth', volume: 0.14, slideTo: 110 });
  },
  reveal: () => {
    noise(0, 0.25, { from: 3000, to: 6000, volume: 0.12, q: 0.8 });
    tone(NOTE(-2), 0, 0.4, { wave: 'sine', volume: 0.25 });
  },
  crown: () => [0, 4, 7, 12, 16].forEach((s, i) => tone(NOTE(s + 3), i * 0.08, 0.3, { volume: 0.24 })),
  fanfare: () => {
    [0, 0, 0, 4, 7].forEach((s, i) => tone(NOTE(s + 3), [0, 0.12, 0.24, 0.4, 0.62][i]!, i === 4 ? 0.8 : 0.14, { wave: 'square', volume: 0.12 }));
    [0, 4, 7].forEach((s) => tone(NOTE(s - 9), 0.62, 0.9, { wave: 'triangle', volume: 0.16 }));
    noise(0.62, 0.5, { from: 2000, to: 8000, volume: 0.08 });
  },
};
