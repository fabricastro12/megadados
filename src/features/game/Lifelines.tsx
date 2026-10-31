'use client';

import type { Lifeline } from '@/game/config';

const LOOK: Record<Lifeline, { label: string; hint: string; color: string; shade: string; glyph: React.ReactNode }> = {
  fiftyFifty: { label: '50/50', hint: 'Saca 2', color: '#9B5CFF', shade: '#6B33C9', glyph: <span className="font-[family-name:var(--font-display)] text-[17px]">50/50</span> },
  pass: {
    label: 'Pase',
    hint: 'Pase',
    color: '#2E8BFF',
    shade: '#1A5FC4',
    glyph: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 12h14M13 6l6 6-6 6" />
      </svg>
    ),
  },
  audience: {
    label: 'Público',
    hint: 'Público',
    color: '#FF5DAA',
    shade: '#C82F7A',
    glyph: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
        <path d="M5 19V12M10 19V7M15 19v-5M20 19V4" />
      </svg>
    ),
  },
};

const NAMES: Record<Lifeline, string> = {
  fiftyFifty: 'Comodín 50/50: saca dos respuestas incorrectas',
  pass: 'Comodín pase: salteás esta pregunta sin perder la racha',
  audience: 'Comodín del público: los demás votan',
};

/** The lifelines enabled for this game; used ones stay visible, crossed out. */
export function Lifelines({ enabled, left, disabled, onUse }: { enabled: Lifeline[]; left: Lifeline[]; disabled: boolean; onUse: (l: Lifeline) => void }) {
  if (enabled.length === 0) return null;
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${enabled.length}, minmax(0, 1fr))` }}>
      {enabled.map((l) => {
        const look = LOOK[l];
        const available = left.includes(l);
        return (
          <button
            key={l}
            type="button"
            disabled={!available || disabled}
            aria-label={available ? NAMES[l] : `${NAMES[l]} (usado)`}
            onClick={() => onUse(l)}
            className="flex flex-col items-center gap-1 disabled:cursor-not-allowed"
          >
            <span
              className={`flex h-[62px] w-[62px] items-center justify-center rounded-full border-4 text-white ${available ? 'border-ink' : 'border-dashed border-ink-soft bg-panel-alt !text-ink-soft line-through'} ${disabled && available ? 'opacity-50' : ''}`}
              style={available ? { background: look.color, boxShadow: `inset 0 -6px 0 ${look.shade}, 0 4px 0 #1C2A66` } : undefined}
            >
              {look.glyph}
            </span>
            <span className={`text-sm font-extrabold ${available ? '' : 'text-ink-soft'}`}>{available ? look.hint : 'Usado'}</span>
          </button>
        );
      })}
    </div>
  );
}
