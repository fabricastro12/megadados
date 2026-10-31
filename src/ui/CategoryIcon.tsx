/** Original line icons per category `icon` key; white strokes over the category color. */
export function CategoryIcon({ icon, size = 28, color = '#fff' }: { icon: string; size?: number; color?: string }) {
  const common = { fill: 'none', stroke: color, strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
      <g {...common}>
        {icon === 'palette' && <><path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 1-4.8c-.8-.4-.5-1.7.5-1.7h2a4 4 0 0 0 4-4C21 6.4 17 3 12 3z" /><circle cx="7" cy="10" r="1" /><circle cx="11" cy="7" r="1" /><circle cx="16" cy="8" r="1" /></>}
        {icon === 'ball' && <><circle cx="12" cy="12" r="9" /><path d="m12 8 4 3-1.5 4.5h-5L8 11zM12 3v5M3.5 9l4.5 2M6.5 19l3-3.5M17.5 19l-3-3.5M20.5 9 16 11" /></>}
        {icon === 'history' && <><path d="m3 8 9-5 9 5zM3 21h18M5 18V9M10 18V9M14 18V9M19 18V9" /></>}
        {icon === 'globe' && <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18M5 7h14M5 17h14" /></>}
        {icon === 'atom' && <><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-60 12 12)" /><ellipse cx="12" cy="12" rx="10" ry="4" /><circle cx="12" cy="12" r="1" /></>}
        {icon === 'film' && <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4m-11-7 5 3-5 3z" /></>}
        {icon === 'chip' && (
          <>
            <rect x="6" y="6" width="12" height="12" rx="2" />
            <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
          </>
        )}
        {icon === 'blocks' && (
          <>
            <rect x="3" y="13" width="8" height="8" rx="1.5" />
            <rect x="13" y="13" width="8" height="8" rx="1.5" />
            <rect x="8" y="3" width="8" height="8" rx="1.5" />
          </>
        )}
        {icon === 'book' && (
          <>
            <path d="M3 6.5c3-1.5 6-1.5 9 0V20c-3-1.5-6-1.5-9 0z" />
            <path d="M21 6.5c-3-1.5-6-1.5-9 0V20c3-1.5 6-1.5 9 0z" />
          </>
        )}
        {icon === 'mountain-sun' && (
          <>
            <circle cx="15.5" cy="7.5" r="3.5" />
            <path d="M2 20l6-9 4 5 3-3 7 7z" />
          </>
        )}
        {icon === 'faces' && (
          <>
            <circle cx="8.5" cy="8.5" r="3.5" />
            <circle cx="16" cy="10.5" r="3.5" />
            <path d="M2.5 20c.5-3 3-4.5 6-4.5M11 20c.5-3 2.5-4.5 5-4.5s4.5 1.5 5 4.5" />
          </>
        )}
        {icon === 'crown' && <path d="M3 18 5 7l4.5 4.5L12 5l2.5 6.5L19 7l2 11z" />}
        {!['chip', 'blocks', 'book', 'mountain-sun', 'faces', 'crown', 'palette', 'ball', 'history', 'globe', 'atom', 'film'].includes(icon) && (
          <>
            <rect x="3" y="8" width="11" height="11" rx="2.5" />
            <rect x="10" y="3" width="11" height="11" rx="2.5" />
          </>
        )}
      </g>
    </svg>
  );
}
