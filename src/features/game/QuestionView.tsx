'use client';

import type { ReactNode } from 'react';
import type { StateEnvelope } from '@/server/games/gameService';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { Toon } from '@/ui/Toon';
import { OPTION_LETTERS, type CategoryLook } from './catalog';
import { Countdown } from './Countdown';

type Content = NonNullable<StateEnvelope['question']>;

export function CategoryBanner({ look, crown, big }: { look: CategoryLook; crown?: boolean; big?: boolean }) {
  return (
    <div
      className="flex flex-1 items-center gap-2.5 rounded-[20px] border-4 border-ink px-3 shadow-[inset_0_-7px_0_rgba(0,0,0,0.18),0_5px_0_#1C2A66]"
      style={{ background: look.color, height: big ? 84 : 60 }}
    >
      <CategoryIcon icon={look.icon} size={big ? 42 : 30} />
      <Toon size={big ? 'md' : 'sm'} className="truncate">
        {look.name}
      </Toon>
      {crown && (
        <span className="ml-auto flex items-center gap-1 rounded-full border-[3px] border-ink bg-gold px-2 py-0.5 text-sm font-extrabold">
          <CategoryIcon icon="crown" size={16} color="#1C2A66" />
          Doble
        </span>
      )}
    </div>
  );
}

export type OptionState = 'idle' | 'picked' | 'removed' | 'correct' | 'wrong' | 'dim';

function optionStyle(state: OptionState): string {
  switch (state) {
    case 'picked':
      return 'bg-cream translate-y-[3px] shadow-[0_2px_0_#1C2A66] outline outline-4 outline-offset-[3px] outline-gold';
    case 'removed':
      return 'border-dashed !border-ink-soft bg-panel-alt text-ink-soft line-through shadow-none';
    case 'correct':
      return 'bg-go text-white shadow-[0_5px_0_#1C2A66]';
    case 'wrong':
      return 'bg-wrong text-white shadow-[0_5px_0_#1C2A66]';
    case 'dim':
      return 'bg-white opacity-55 shadow-[0_5px_0_#1C2A66]';
    default:
      return 'bg-white shadow-[0_5px_0_#1C2A66]';
  }
}

/** Prompt plus four options. The parent decides each option's state and what a tap does. */
export function QuestionView({
  content,
  look,
  crown,
  deadline,
  totalSeconds,
  states,
  onPick,
  extra,
  big,
  footer,
}: {
  content: Content;
  look: CategoryLook;
  crown: boolean;
  deadline: number | null;
  totalSeconds: number;
  states: OptionState[];
  onPick?: (choice: number) => void;
  /** Rendered inside each option, after the text (avatars on the TV reveal). */
  extra?: (choice: number) => ReactNode;
  big?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className={`flex flex-col ${big ? 'gap-6' : 'gap-3.5'}`}>
      <div className="flex items-center gap-3">
        <CategoryBanner look={look} crown={crown} big={big} />
        {deadline !== null && <Countdown deadline={deadline} total={totalSeconds} size={big ? 96 : 64} />}
      </div>
      <div className={`sticker flex items-center ${big ? 'min-h-48 px-10 py-8' : 'min-h-36 px-5 py-5'}`}>
        <h1 className={`font-extrabold leading-tight ${big ? 'text-5xl' : 'text-[1.55rem]'}`}>{content.prompt}</h1>
      </div>
      {content.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={content.imageUrl} alt="" className="mx-auto max-h-48 rounded-2xl border-4 border-ink object-contain" />
      )}
      <div role="group" aria-label="Opciones" className={`grid gap-3 ${big ? 'grid-cols-2 gap-5' : ''}`}>
        {content.options.map((text, i) => {
          const state = states[i] ?? 'idle';
          const interactive = !!onPick && (state === 'idle' || state === 'picked');
          return (
            <button
              key={i}
              type="button"
              disabled={!interactive}
              aria-pressed={state === 'picked'}
              onClick={() => onPick?.(i)}
              className={`flex items-center gap-3 rounded-[20px] border-4 border-ink px-3.5 text-left font-extrabold transition-transform ${big ? 'min-h-24 text-3xl' : 'min-h-16 text-xl'} ${optionStyle(state)} ${interactive ? 'active:translate-y-[3px]' : ''}`}
            >
              <span
                className={`flex flex-none items-center justify-center rounded-full border-[3px] border-ink font-[family-name:var(--font-display)] text-ink ${state === 'picked' ? 'bg-gold' : 'bg-panel-alt'} ${big ? 'h-14 w-14 text-2xl' : 'h-9 w-9 text-[17px]'}`}
              >
                {OPTION_LETTERS[i]}
              </span>
              <span className="flex-1">{text}</span>
              {state === 'correct' && <span className="sr-only">(correcta)</span>}
              {extra?.(i)}
            </button>
          );
        })}
      </div>
      {footer}
    </div>
  );
}
