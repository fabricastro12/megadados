'use client';

import { audio } from './engine';

/**
 * A short game-show loop played on the TV: bass, chords and a bouncy arpeggio in C major
 * pentatonic, scheduled a little ahead of time on the Web Audio clock so it never drifts.
 */
const BPM = 112;
const STEP = 60 / BPM / 2; // eighth notes
const BARS = [
  { root: 0, chord: [0, 4, 7] }, // C
  { root: -3, chord: [-3, 0, 4] }, // Am
  { root: 5, chord: [5, 9, 12] }, // F
  { root: 7, chord: [7, 11, 14] }, // G
];
const ARPEGGIO = [0, 2, 1, 2, 0, 2, 1, 2];
const C4 = 261.63;
const freq = (semitones: number, octave = 0) => C4 * 2 ** (semitones / 12 + octave);

let timer: ReturnType<typeof setInterval> | null = null;
let nextAt = 0;
let step = 0;
let energy: 'calm' | 'game' = 'calm';

function note(f: number, at: number, length: number, wave: OscillatorType, volume: number): void {
  const e = audio();
  if (!e) return;
  const osc = e.ctx.createOscillator();
  const gain = e.ctx.createGain();
  osc.type = wave;
  osc.frequency.value = f;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(e.music);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

function schedule(): void {
  const e = audio();
  if (!e || e.ctx.state !== 'running') return;
  while (nextAt < e.ctx.currentTime + 0.2) {
    const bar = BARS[Math.floor(step / 8) % BARS.length]!;
    const i = step % 8;
    if (i % 4 === 0) note(freq(bar.root, -2), nextAt, STEP * 3.5, 'triangle', 0.35);
    if (energy === 'game' && i % 4 === 2) note(freq(bar.root + 7, -2), nextAt, STEP * 1.5, 'triangle', 0.2);
    if (i === 0) bar.chord.forEach((s) => note(freq(s), nextAt, STEP * 7, 'sine', 0.05));
    const arp = bar.chord[ARPEGGIO[i]!]!;
    if (energy === 'game' || i % 2 === 0) note(freq(arp, 1), nextAt, STEP * 0.8, 'square', 0.035);
    nextAt += STEP;
    step += 1;
  }
}

export const music = {
  start(mood: 'calm' | 'game') {
    energy = mood;
    const e = audio();
    if (!e || timer) return;
    nextAt = e.ctx.currentTime + 0.1;
    step = 0;
    timer = setInterval(schedule, 50);
  },
  stop() {
    if (timer) clearInterval(timer);
    timer = null;
  },
};
