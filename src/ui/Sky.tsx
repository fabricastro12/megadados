import type { ReactNode } from 'react';

function Cloud({ className }: { className: string }) {
  return (
    <svg className={`pointer-events-none absolute ${className}`} viewBox="0 0 200 90" aria-hidden="true">
      <g fill="#fff">
        <circle cx="55" cy="55" r="30" />
        <circle cx="95" cy="40" r="36" />
        <circle cx="140" cy="55" r="28" />
        <rect x="40" y="55" width="120" height="30" rx="15" />
      </g>
    </svg>
  );
}

/** The sky with a few clouds behind every screen. */
export function Sky({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative min-h-dvh overflow-hidden ${className}`}>
      <Cloud className="-left-14 top-28 w-48 opacity-95" />
      <Cloud className="-right-12 top-[55%] w-44 opacity-90" />
      <Cloud className="left-[40%] -top-6 hidden w-60 opacity-80 md:block" />
      <div className="relative">{children}</div>
    </div>
  );
}
