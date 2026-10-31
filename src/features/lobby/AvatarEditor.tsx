'use client';

import { AVATAR_COLORS, AVATAR_FACES, type Avatar } from '@/rooms/model';
import { AVATAR_FACE_LABEL, AVATAR_PALETTE } from '@/theme/tokens';
import { DieAvatar } from '@/ui/DieAvatar';

function Arrow({ dir, onClick, label }: { dir: 'left' | 'right'; onClick: () => void; label: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="btn btn-gold !min-h-0 h-12 w-12 !rounded-full !p-0">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  );
}

export function randomAvatar(): Avatar {
  return {
    color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]!,
    face: AVATAR_FACES[Math.floor(Math.random() * AVATAR_FACES.length)]!,
  };
}

/** skribbl-style die builder: arrows change the face, swatches change the color. */
export function AvatarEditor({ value, onChange }: { value: Avatar; onChange: (avatar: Avatar) => void }) {
  const faceIndex = AVATAR_FACES.indexOf(value.face);
  const step = (delta: number) => onChange({ ...value, face: AVATAR_FACES[(faceIndex + delta + AVATAR_FACES.length) % AVATAR_FACES.length]! });
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-4">
        <Arrow dir="left" label="Cara anterior" onClick={() => step(-1)} />
        <DieAvatar avatar={value} size={128} />
        <Arrow dir="right" label="Cara siguiente" onClick={() => step(1)} />
      </div>
      <p className="text-sm font-extrabold" aria-live="polite">
        {AVATAR_FACE_LABEL[value.face]}
        <span className="ml-2 font-semibold text-ink-soft">{faceIndex + 1}/{AVATAR_FACES.length}</span>
      </p>
      <details className="w-full max-w-sm">
        <summary className="cursor-pointer rounded-xl px-3 py-2 text-center text-sm font-extrabold underline">Ver todas las caras</summary>
        <fieldset className="mt-2 grid grid-cols-4 gap-2 rounded-2xl bg-panel-alt p-2">
          <legend className="sr-only">Cara del dado</legend>
          {AVATAR_FACES.map((face) => (
            <label key={face} className={`relative flex cursor-pointer justify-center rounded-xl border-[3px] p-1 focus-within:outline focus-within:outline-4 focus-within:outline-gold ${value.face === face ? 'border-ink bg-cream' : 'border-transparent'}`} title={AVATAR_FACE_LABEL[face]}>
              <input type="radio" name="avatar-face" value={face} checked={value.face === face} onChange={() => onChange({ ...value, face })} aria-label={AVATAR_FACE_LABEL[face]} className="sr-only" />
              <span aria-hidden="true"><DieAvatar avatar={{ ...value, face }} size={44} /></span>
            </label>
          ))}
        </fieldset>
      </details>
      <div role="radiogroup" aria-label="Color del dado" className="flex w-full max-w-sm flex-wrap justify-center gap-2">
        {AVATAR_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={value.color === color}
            aria-label={AVATAR_PALETTE[color].label}
            onClick={() => onChange({ ...value, color })}
            title={AVATAR_PALETTE[color].label}
            className="h-10 w-10 flex-none rounded-full border-4 border-ink"
            style={{
              background: AVATAR_PALETTE[color].face,
              boxShadow: value.color === color ? '0 0 0 3px #fff, 0 0 0 6px #FFD23F' : undefined,
            }}
          />
        ))}
      </div>
      <button type="button" className="btn !min-h-10 text-sm" onClick={() => onChange(randomAvatar())}>
        Al azar
      </button>
    </div>
  );
}
