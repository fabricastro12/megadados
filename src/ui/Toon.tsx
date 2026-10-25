import type { CSSProperties, ElementType, ReactNode } from 'react';

const SIZES = {
  sm: { fontSize: '1.5rem', stroke: '5px', drop: '3px' },
  md: { fontSize: '2.25rem', stroke: '7px', drop: '5px' },
  lg: { fontSize: '3rem', stroke: '9px', drop: '6px' },
  xl: { fontSize: '4rem', stroke: '11px', drop: '8px' },
  xxl: { fontSize: '6rem', stroke: '14px', drop: '10px' },
} as const;

/** Outlined display text (Lilita One), the game's headline voice. */
export function Toon({
  as: Tag = 'span',
  size = 'md',
  className = '',
  style,
  children,
}: {
  as?: ElementType;
  size?: keyof typeof SIZES;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const s = SIZES[size];
  return (
    <Tag className={`toon ${className}`} style={{ fontSize: s.fontSize, '--stroke': s.stroke, '--drop': s.drop, ...style } as CSSProperties}>
      {children}
    </Tag>
  );
}
