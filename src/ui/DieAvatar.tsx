import type { Avatar } from '@/rooms/model';
import { AVATAR_FACE_LABEL, AVATAR_PALETTE } from '@/theme/tokens';

const INK = '#1C2A66';

function Face({ face }: { face: Avatar['face'] }) {
  switch (face) {
    case 'cool':
      return (
        <>
          <path d="M60 112 L152 112 L148 132 Q140 144 124 140 L112 126 L100 126 L88 140 Q72 144 64 132 Z" fill={INK} />
          <path d="M70 118 L82 118" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
          <path d="M80 166 Q106 182 134 164" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
        </>
      );
    case 'wink':
      return (
        <>
          <ellipse cx="84" cy="124" rx="16" ry="20" fill="#fff" stroke={INK} strokeWidth="6" />
          <ellipse cx="89" cy="128" rx="7" ry="10" fill={INK} />
          <path d="M112 126 Q128 114 144 126" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
          <path d="M78 158 Q106 186 136 156 Q106 166 78 158 Z" fill={INK} stroke={INK} strokeWidth="6" strokeLinejoin="round" />
        </>
      );
    case 'surprised':
      return (
        <>
          <ellipse cx="84" cy="120" rx="16" ry="20" fill="#fff" stroke={INK} strokeWidth="6" />
          <ellipse cx="128" cy="120" rx="16" ry="20" fill="#fff" stroke={INK} strokeWidth="6" />
          <circle cx="84" cy="122" r="6" fill={INK} />
          <circle cx="128" cy="122" r="6" fill={INK} />
          <ellipse cx="106" cy="168" rx="12" ry="14" fill={INK} />
        </>
      );
    case 'tongue':
      return (
        <>
          <path d="M70 124 Q84 112 98 124 M114 124 Q128 112 142 124" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
          <path d="M76 156 Q106 184 136 156 Z" fill={INK} stroke={INK} strokeWidth="6" strokeLinejoin="round" />
          <path d="M100 164 Q112 160 118 170 Q118 190 106 188 Q98 184 100 164 Z" fill="#FF5DAA" stroke={INK} strokeWidth="5" />
        </>
      );
    default:
      return (
        <>
          <ellipse cx="84" cy="122" rx="16" ry="20" fill="#fff" stroke={INK} strokeWidth="6" />
          <ellipse cx="128" cy="122" rx="16" ry="20" fill="#fff" stroke={INK} strokeWidth="6" />
          <ellipse cx="90" cy="126" rx="7" ry="10" fill={INK} />
          <ellipse cx="122" cy="126" rx="7" ry="10" fill={INK} />
          <path d="M76 158 Q106 188 138 156 Q106 168 76 158 Z" fill={INK} stroke={INK} strokeWidth="6" strokeLinejoin="round" />
        </>
      );
  }
}

/** A player's die head: their color and face. */
export function DieAvatar({ avatar, size = 48, dim = false, title }: { avatar: Avatar; size?: number; dim?: boolean; title?: string }) {
  const p = AVATAR_PALETTE[avatar.color];
  const label = title ?? `Dado ${p.label.toLowerCase()}, cara ${AVATAR_FACE_LABEL[avatar.face].toLowerCase()}`;
  return (
    <svg width={size} height={size} viewBox="30 34 176 176" role="img" aria-label={label} style={{ opacity: dim ? 0.4 : 1, flex: 'none' }}>
      <g stroke={INK} strokeWidth={size < 60 ? 9 : 7} strokeLinejoin="round">
        <path d="M48 76 L80 44 L198 44 L170 76 Z" fill={p.top} />
        <path d="M170 76 L198 44 L198 166 L170 200 Z" fill={p.side} />
        <rect x="40" y="74" width="132" height="128" rx="22" fill={p.face} />
      </g>
      {size >= 60 && <path d="M52 112 Q52 88 74 84" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" />}
      <Face face={avatar.face} />
    </svg>
  );
}
