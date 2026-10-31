'use client';

import type { ReactNode } from 'react';
import type { StateEnvelope } from '@/server/games/gameService';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { Toon } from '@/ui/Toon';
import { OPTION_LETTERS, type CategoryLook } from './catalog';
import { Countdown } from './Countdown';
import { QuestionPhoto } from './QuestionPhoto';

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
      <div className={`sticker flex items-center ${big ? (content.imageUrl ? 'px-6 py-3' : 'min-h-[20vh] px-10 py-6') : (content.imageUrl ? 'px-5 py-3' : 'min-h-36 px-5 py-5')}`}>
        <h1
          className={`font-extrabold leading-tight ${big ? '' : 'text-[1.55rem]'}`}
          // On the TV, long prompts shrink with the screen height so the options stay in view.
          style={big ? { fontSize: `clamp(1.5rem, ${content.imageUrl ? 3.2 : content.prompt.length > 80 ? 4.4 : 5.6}vh, 3.25rem)` } : undefined}
        >
          {content.prompt}
        </h1>
      </div>
      {content.imageUrl && <QuestionPhoto path={content.imageUrl} big={big} />}
      {content.imageCredit && (
        <p className="text-center text-xs font-semibold text-ink-soft">
          {content.imageCredit}{' '}
          {content.imageSource && <a href={content.imageSource} target="_blank" rel="noreferrer" className="underline">Fuente y licencia</a>}
        </p>
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
              className={`flex items-center gap-3 rounded-[20px] border-4 border-ink px-3.5 text-left font-extrabold transition-transform ${big ? 'min-h-[11vh] text-[clamp(1.25rem,3.6vh,2rem)]' : 'min-h-16 text-xl'} ${optionStyle(state)} ${interactive ? 'active:translate-y-[3px]' : ''}`}
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
