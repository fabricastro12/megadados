'use client';

import { useEffect, useRef } from 'react';
import type { ApiResult } from '@/lib/api';
import { serverNow } from '@/realtime/clock';
import { useRoom } from '@/realtime/roomStore';

const RETRY_MS = 1000;

/**
 * Phases end on the server only when a client asks (`tick`) after the deadline. Host and TV ask
 * right away; players wait a little longer, as a fallback when no big screen is around.
 * Duplicate ticks are harmless: the server rejects every one but the first.
 */
export function useAutoTick(command: (body: Record<string, unknown>) => Promise<ApiResult<unknown>>, eager: boolean) {
  const deadline = useRoom((s) => s.game?.state.phaseDeadline ?? null);
  const phase = useRoom((s) => s.game?.state.phase);
  const version = useRoom((s) => s.game?.version);
  const inFlight = useRef(false);

  useEffect(() => {
    if (deadline === null || phase === 'paused' || phase === 'finished') return;
    const delay = eager ? 150 + Math.random() * 250 : 1800 + Math.random() * 1200;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const attempt = async () => {
      if (stopped || inFlight.current) return;
      inFlight.current = true;
      const result = await command({ type: 'tick' });
      inFlight.current = false;
      // Not yet due (someone used +10 s, or our clock runs ahead): try again shortly.
      if (!stopped && !result.ok && result.error === 'deadline_not_reached') timer = setTimeout(attempt, RETRY_MS);
    };
    timer = setTimeout(attempt, Math.max(0, deadline - serverNow()) + delay);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [deadline, phase, version, eager, command]);
}
