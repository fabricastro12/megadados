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
    case 'laugh':
      return (
        <>
          <path d="M70 125q14-20 28 0m16 0q14-20 28 0" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
          <path d="M76 150h62c-2 27-14 40-31 40s-29-13-31-40z" fill={INK} stroke={INK} strokeWidth="6" strokeLinejoin="round" />
          <path d="M82 153h50l-4 10H86z" fill="#fff" />
          <path d="M92 182q15-15 30 0-14 9-30 0" fill="#FF7B9C" />
        </>
      );
    case 'hearts':
      return (
        <>
          {[84, 128].map((x) => (
            <path key={x} transform={`translate(${x} 122)`} d="M0 17C-7 10-19 3-18-7c1-12 14-14 18-4 4-10 17-8 18 4C19 3 7 10 0 17z" fill="#FF4D75" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
          ))}
          <path d="M82 158q24 33 48 0" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
        </>
      );
    case 'stars':
      return (
        <>
          {[83, 129].map((x) => (
            <path key={x} transform={`translate(${x} 122)`} d="m0-20 6 13 14 2-10 10 2 14L0 12l-12 7 2-14-10-10 14-2z" fill="#FFD23F" stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
          ))}
          <path d="M80 158q26 8 52 0-3 26-26 26t-26-26z" fill={INK} />
          <path d="M89 162q17 4 34 0l-3 8H92z" fill="#fff" />
        </>
      );
    case 'sleepy':
      return (
        <>
          <path d="M69 124q15 14 30 0m15 0q15 14 30 0" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
          <ellipse cx="104" cy="165" rx="10" ry="12" fill={INK} />
          <path d="M132 153h13l-13 12h13m-1-29h14l-14 12h14" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'angry':
      return (
        <>
          <ellipse cx="84" cy="127" rx="15" ry="17" fill="#fff" stroke={INK} strokeWidth="6" />
          <ellipse cx="128" cy="127" rx="15" ry="17" fill="#fff" stroke={INK} strokeWidth="6" />
          <circle cx="89" cy="129" r="7" fill={INK} /><circle cx="123" cy="129" r="7" fill={INK} />
          <path d="m67 103 31 12m16 0 31-12M85 173q21-21 42 0" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
        </>
      );
    case 'sad':
      return (
        <>
          <path d="m68 108 28-9m20 0 28 9" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
          <ellipse cx="84" cy="128" rx="14" ry="17" fill="#fff" stroke={INK} strokeWidth="5" />
          <ellipse cx="128" cy="128" rx="14" ry="17" fill="#fff" stroke={INK} strokeWidth="5" />
          <circle cx="87" cy="131" r="7" fill={INK} /><circle cx="125" cy="131" r="7" fill={INK} />
          <path d="M138 141q-13 17-5 22c14 7 16-9 5-22z" fill="#53CFF1" stroke={INK} strokeWidth="4" />
          <path d="M88 177q18-20 36 0" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
        </>
      );
    case 'nerd':
      return (
        <>
          <path d="M59 119h7m40 0h7m37 0h10" stroke={INK} strokeWidth="6" />
          <circle cx="84" cy="122" r="21" fill="#EAF5FC" stroke={INK} strokeWidth="7" />
          <circle cx="130" cy="122" r="21" fill="#EAF5FC" stroke={INK} strokeWidth="7" />
          <ellipse cx="88" cy="125" rx="7" ry="10" fill={INK} /><ellipse cx="126" cy="125" rx="7" ry="10" fill={INK} />
          <path d="m71 113 7-5m45 4 7-5" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          <path d="M83 158q24 29 48 0" fill={INK} stroke={INK} strokeWidth="6" strokeLinejoin="round" />
          <path d="M97 161h20v13H97z" fill="#fff" /><path d="M107 161v13" stroke={INK} strokeWidth="3" />
        </>
      );
    case 'robot':
      return (
        <>
          <rect x="66" y="108" width="34" height="29" rx="5" fill="#A6F2F3" stroke={INK} strokeWidth="6" />
          <rect x="114" y="108" width="34" height="29" rx="5" fill="#A6F2F3" stroke={INK} strokeWidth="6" />
          <path d="M83 116v13m48-13v13" stroke={INK} strokeWidth="7" strokeLinecap="round" />
          <circle cx="61" cy="151" r="4" fill={INK} /><circle cx="153" cy="151" r="4" fill={INK} />
          <rect x="80" y="155" width="54" height="25" rx="6" fill="#fff" stroke={INK} strokeWidth="6" />
          <path d="M94 156v23m13-23v23m13-23v23" stroke={INK} strokeWidth="4" />
        </>
      );
    case 'cat':
      return (
        <>
          <path d="m63 108 2-24 22 18m40 0 22-18 2 24" fill="#FFB0D4" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
          <ellipse cx="84" cy="125" rx="14" ry="17" fill="#fff" stroke={INK} strokeWidth="5" />
          <ellipse cx="129" cy="125" rx="14" ry="17" fill="#fff" stroke={INK} strokeWidth="5" />
          <path d="M84 117v16m45-16v16" stroke={INK} strokeWidth="6" strokeLinecap="round" />
          <path d="m98 147 9 9 9-9z" fill="#FF7B9C" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          <path d="M92 165q15 13 15-9 0 22 15 9m-39-14-23-4m23 13-23 5m71-14 23-4m-23 13 23 5" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        </>
      );
    case 'mustache':
      return (
        <>
          <ellipse cx="84" cy="121" rx="12" ry="15" fill="#fff" stroke={INK} strokeWidth="5" />
          <ellipse cx="128" cy="121" rx="12" ry="15" fill="#fff" stroke={INK} strokeWidth="5" />
          <circle cx="87" cy="124" r="6" fill={INK} /><circle cx="125" cy="124" r="6" fill={INK} />
          <path d="M107 151c-13-15-20 13-39-3 3 24 26 29 39 13 13 16 36 11 39-13-19 16-26-12-39 3z" fill={INK} />
          <path d="M97 178q10 8 20 0" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
        </>
      );
    case 'dizzy':
      return (
        <>
          <path d="m73 112 23 23m0-23-23 23m44-23 23 23m0-23-23 23" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
          <path d="M80 166c9-16 18 16 27 0s18 16 27 0" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
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
