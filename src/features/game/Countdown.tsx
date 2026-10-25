'use client';

import { useServerNow } from '@/realtime/clock';
import { useRoom } from '@/realtime/roomStore';

/** Server time for game clocks: it stands still while the host has the game paused. */
export function useGameNow(intervalMs = 200): number {
  const now = useServerNow(intervalMs);
  const pausedAt = useRoom((s) => s.game?.state.pausedAt ?? null);
  return now === 0 ? 0 : (pausedAt ?? now);
}

/** Seconds left until `deadline` (server time), never negative. */
export function useSecondsLeft(deadline: number | null): number {
  const now = useGameNow(200);
  if (deadline === null || now === 0) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** Ring countdown; turns red in the last five seconds. */
export function Countdown({ deadline, total, size = 64 }: { deadline: number | null; total: number; size?: number }) {
  const now = useGameNow(100);
  const leftMs = deadline === null || now === 0 ? 0 : Math.max(0, deadline - now);
  const seconds = Math.ceil(leftMs / 1000);
  const share = total > 0 ? Math.min(1, leftMs / (total * 1000)) : 0;
  const urgent = seconds <= 5;
  const inner = size * 0.69;
  return (
    <div
      role="timer"
      aria-label={`Quedan ${seconds} segundos`}
      className="flex flex-none items-center justify-center rounded-full border-4 border-ink shadow-[0_5px_0_#1C2A66]"
      style={{ width: size, height: size, background: `conic-gradient(${urgent ? '#FF4D5A' : '#FFD23F'} 0 ${share * 100}%, #fff ${share * 100}% 100%)` }}
    >
      <span
        className={`flex items-center justify-center rounded-full border-[3px] border-ink bg-white font-[family-name:var(--font-display)] ${urgent ? 'text-wrong' : ''}`}
        style={{ width: inner, height: inner, fontSize: size * 0.34 }}
        aria-hidden="true"
      >
        {seconds}
      </span>
    </div>
  );
}
