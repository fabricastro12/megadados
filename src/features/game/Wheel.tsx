'use client';

import { useEffect, useRef } from 'react';
import type { SpinState } from '@/game';
import { serverNow } from '@/realtime/clock';
import { CategoryIcon } from '@/ui/CategoryIcon';
import type { CategoryLook } from './catalog';

const INK = '#1C2A66';

/** Rotation (degrees) that puts the middle of `segment` under the top pointer after `turns` laps. */
export function landingAngle(segment: number, segments: number, turns: number): number {
  const size = 360 / segments;
  return turns * 360 + (360 - (segment + 0.5) * size);
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Wheel angle at server time `now`; every client computes the same value from the same spin. */
export function wheelAngle(spin: SpinState | null, segments: number, now: number): number {
  if (!spin) return 0;
  const target = landingAngle(spin.segment, segments, spin.turns);
  const t = Math.min(1, Math.max(0, (now - spin.startedAt) / spin.durationMs));
  return target * easeOutCubic(t);
}

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(from));
  const y1 = cy + r * Math.sin(rad(from));
  const x2 = cx + r * Math.cos(rad(to));
  const y2 = cy + r * Math.sin(rad(to));
  return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2},${y2} Z`;
}

/**
 * The category wheel with the crown segment last. It animates from the spin the server chose,
 * using server time, so phones and the TV land on the same segment at the same moment.
 */
export function Wheel({
  segments,
  spin,
  size = 300,
  label,
  pausedAt = null,
}: {
  segments: CategoryLook[];
  spin: SpinState | null;
  size?: number;
  label?: string;
  /** Freezes the wheel where it was when the host paused. */
  pausedAt?: number | null;
}) {
  const rotor = useRef<SVGGElement>(null);
  const n = segments.length;
  const step = 360 / n;

  useEffect(() => {
    let frame = 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = () => {
      const now = pausedAt ?? serverNow();
      const angle = reduce && spin ? landingAngle(spin.segment, n, 0) : wheelAngle(spin, n, now);
      rotor.current?.setAttribute('transform', `rotate(${angle % 360} 150 150)`);
      if (spin && pausedAt === null && now < spin.startedAt + spin.durationMs && !reduce) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [spin, n, pausedAt]);

  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={label ?? 'Ruleta de categorías'}>
      <svg viewBox="0 0 300 300" width={size} height={size} aria-hidden="true">
        <circle cx="150" cy="156" r="146" fill={INK} />
        <g ref={rotor}>
          {segments.map((c, i) => (
            <g key={c.id + i}>
              <path d={arc(150, 150, 140, i * step, (i + 1) * step)} fill={c.color} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
              <path d={arc(150, 150, 140, i * step + step * 0.08, (i + 1) * step - step * 0.08)} fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="6" />
              <g transform={`rotate(${(i + 0.5) * step} 150 150) translate(150 58)`}>
                <g transform="translate(-17 -17)">
                  <CategoryIcon icon={c.icon} size={34} color={c.icon === 'crown' ? INK : '#fff'} />
                </g>
              </g>
            </g>
          ))}
          <circle cx="150" cy="150" r="140" fill="none" stroke={INK} strokeWidth="8" />
        </g>
        <circle cx="150" cy="150" r="30" fill="#fff" stroke={INK} strokeWidth="6" />
        <circle cx="150" cy="150" r="12" fill="#FFD23F" stroke={INK} strokeWidth="4" />
      </svg>
      <svg className="absolute left-1/2 top-[-14px] -translate-x-1/2" width={size * 0.16} height={size * 0.2} viewBox="0 0 40 50" aria-hidden="true">
        <path d="M20 46 L4 10 Q20 -2 36 10 Z" fill="#FF4D5A" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
