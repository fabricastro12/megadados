/**
 * Design tokens. Swap Megafy's brand values here (the mascot sheet gives navy, red and teal);
 * globals.css mirrors the UI colors as CSS variables for Tailwind.
 */
export const BRAND = {
  navy: '#23254A',
  red: '#EE3E38',
  teal: '#18A89E',
} as const;

export const UI = {
  skyTop: '#3FB2EE',
  skyBottom: '#9EDCF8',
  ink: '#1C2A66',
  inkSoft: '#4A5A96',
  panel: '#FFFFFF',
  panelAlt: '#EAF5FC',
  go: '#2CC56F',
  goShade: '#1C8A4C',
  wrong: '#FF4D5A',
  wrongShade: '#B8202E',
  gold: '#FFD23F',
  goldShade: '#D9A400',
} as const;

/** Die avatar palettes: main face, top (light), side (dark). */
export const AVATAR_PALETTE = {
  violet: { face: '#9B5CFF', top: '#C3A2FF', side: '#6B33C9', label: 'Violeta' },
  blue: { face: '#2E8BFF', top: '#8CC2FF', side: '#1A5FC4', label: 'Azul' },
  green: { face: '#2CC56F', top: '#8FEBB6', side: '#1C8A4C', label: 'Verde' },
  yellow: { face: '#FFB31A', top: '#FFE08A', side: '#D07F00', label: 'Amarillo' },
  orange: { face: '#FF6A3D', top: '#FFB399', side: '#C9411A', label: 'Naranja' },
  pink: { face: '#FF5DAA', top: '#FFB0D4', side: '#C82F7A', label: 'Rosa' },
  red: { face: '#F25565', top: '#FFABB4', side: '#C52B40', label: 'Rojo' },
  cyan: { face: '#28BED9', top: '#99E6F2', side: '#16849F', label: 'Celeste' },
  teal: { face: '#26B4AA', top: '#8DE1D4', side: '#147D79', label: 'Turquesa' },
  lime: { face: '#B5D843', top: '#DFEE9E', side: '#7C9D22', label: 'Lima' },
  mint: { face: '#83DDB6', top: '#C6F3DF', side: '#43A87D', label: 'Menta' },
  coral: { face: '#FF9884', top: '#FFD2C7', side: '#D26857', label: 'Coral' },
  lavender: { face: '#C3A5EF', top: '#E7D7FC', side: '#9270C4', label: 'Lavanda' },
  cream: { face: '#F5DDA0', top: '#FFF0CC', side: '#C6A65E', label: 'Crema' },
  pearl: { face: '#E9EFF8', top: '#FFFFFF', side: '#ACBDD8', label: 'Perla' },
  caramel: { face: '#CE9B72', top: '#EFCBAD', side: '#A66D47', label: 'Caramelo' },
} as const;

export const AVATAR_FACE_LABEL = {
  happy: 'Feliz',
  cool: 'Canchero',
  wink: 'Guiño',
  surprised: 'Sorpresa',
  tongue: 'Lengua',
  laugh: 'Carcajada',
  hearts: 'Enamorado',
  stars: 'Estrellitas',
  sleepy: 'Dormilón',
  angry: 'Enojado',
  sad: 'Tristón',
  nerd: 'Nerd',
  robot: 'Robot',
  cat: 'Gatito',
  mustache: 'Bigote',
  dizzy: 'Mareado',
} as const;

/** Darker shade per category color, for the sticker bottom edge. */
export function shade(hex: string, amount = 0.28): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v * (1 - amount));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export const REACTIONS = [
  { kind: 'heart', label: 'Corazón', color: '#FF5DAA' },
  { kind: 'fire', label: 'Fuego', color: '#FF6A3D' },
  { kind: 'star', label: 'Estrella', color: '#FFD23F' },
  { kind: 'clap', label: 'Aplauso', color: '#2CC56F' },
  { kind: 'laugh', label: 'Risa', color: '#2E8BFF' },
] as const;
