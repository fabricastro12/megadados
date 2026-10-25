'use client';

import { useRoom } from '@/realtime/roomStore';
import { REACTIONS } from '@/theme/tokens';

function ReactionGlyph({ kind, size = 28 }: { kind: string; size?: number }) {
  const common = { stroke: '#1C2A66', strokeWidth: 2.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const color = REACTIONS.find((r) => r.kind === kind)?.color ?? '#FFD23F';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {kind === 'heart' && <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill={color} {...common} />}
      {kind === 'fire' && <path d="M12 21c-4 0-6-2.8-6-6 0-4 4-6 3.5-10 3 1.5 5 4 5 6.5 1-1 1.5-2 1.5-3.5 2 2 2 4.5 2 7 0 3.2-2 6-6 6z" fill={color} {...common} />}
      {kind === 'star' && <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill={color} {...common} />}
      {kind === 'clap' && (
        <g fill={color} {...common}>
          <path d="M7 13l5-8a1.6 1.6 0 0 1 2.8 1.6L12 11l4-5a1.6 1.6 0 0 1 2.6 1.9l-4.4 7A6 6 0 0 1 6 17z" />
          <path d="M4 7l1.5 1M6 4l.6 1.8M3 11h1.8" fill="none" />
        </g>
      )}
      {kind === 'laugh' && (
        <g {...common}>
          <circle cx="12" cy="12" r="9" fill={color} />
          <path d="M8 9.5l1.5 1-1.5 1M16 9.5l-1.5 1 1.5 1" fill="none" />
          <path d="M7.5 14h9a4.5 4.5 0 0 1-9 0z" fill="#fff" />
        </g>
      )}
    </svg>
  );
}

/** Reactions floating up from the bottom of the screen; purely decorative. */
export function ReactionLayer({ big }: { big?: boolean }) {
  const reactions = useRoom((s) => s.reactions);
  const names = useRoom((s) => s.lobby?.players);
  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
      {reactions.map((r) => {
        const left = 8 + ((r.id * 37) % 84);
        const who = names?.find((p) => p.id === r.playerId)?.name;
        return (
          <div key={r.id} className="reaction-float absolute bottom-0 flex flex-col items-center" style={{ left: `${left}%` }}>
            <ReactionGlyph kind={r.kind} size={big ? 72 : 40} />
            {big && who && <span className="rounded-full border-2 border-ink bg-white px-2 text-lg font-extrabold">{who}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function ReactionBar({ onReact }: { onReact: (kind: string) => void }) {
  return (
    <div className="flex justify-center gap-2" role="group" aria-label="Reacciones">
      {REACTIONS.map((r) => (
        <button
          key={r.kind}
          type="button"
          aria-label={r.label}
          onClick={() => onReact(r.kind)}
          className="flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-ink bg-white shadow-[0_3px_0_#1C2A66] active:translate-y-[2px] active:shadow-none"
        >
          <ReactionGlyph kind={r.kind} />
        </button>
      ))}
    </div>
  );
}
