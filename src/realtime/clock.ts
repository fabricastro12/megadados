'use client';

import { useSyncExternalStore } from 'react';

let offset = 0;
let synced = false;
const listeners = new Set<() => void>();

/**
 * Estimates server time − local time from a few round trips, keeping the one with the lowest
 * latency (its midpoint is the most accurate). Every countdown uses serverNow().
 */
export async function syncClock(samples = 5): Promise<number> {
  let best: { rtt: number; offset: number } | null = null;
  for (let i = 0; i < samples; i++) {
    const sent = Date.now();
    try {
      const res = await fetch('/api/time', { cache: 'no-store' });
      const { now } = (await res.json()) as { now: number };
      const received = Date.now();
      const rtt = received - sent;
      const estimate = now - (sent + rtt / 2);
      if (!best || rtt < best.rtt) best = { rtt, offset: estimate };
    } catch {
      // Ignore a failed sample; the others still count.
    }
  }
  if (best) {
    offset = best.offset;
    synced = true;
    listeners.forEach((l) => l());
  }
  return offset;
}

export function serverNow(): number {
  return Date.now() + offset;
}

export function isClockSynced(): boolean {
  return synced;
}

/** Re-renders every `intervalMs` with the server time; for countdowns. */
export function useServerNow(intervalMs = 200): number {
  return useSyncExternalStore(
    (notify) => {
      const id = setInterval(notify, intervalMs);
      listeners.add(notify);
      return () => {
        clearInterval(id);
        listeners.delete(notify);
      };
    },
    () => Math.floor(serverNow() / intervalMs) * intervalMs,
    () => 0,
  );
}
