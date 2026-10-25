/** Original line icons per category `icon` key; white strokes over the category color. */
export function CategoryIcon({ icon, size = 28, color = '#fff' }: { icon: string; size?: number; color?: string }) {
  const common = { fill: 'none', stroke: color, strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
      <g {...common}>
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
        {!['chip', 'blocks', 'book', 'mountain-sun', 'faces', 'crown'].includes(icon) && (
          <>
            <rect x="3" y="8" width="11" height="11" rx="2.5" />
            <rect x="10" y="3" width="11" height="11" rx="2.5" />
          </>
        )}
      </g>
    </svg>
  );
}
