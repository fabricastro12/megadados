'use client';

import dynamic from 'next/dynamic';
import { notFound, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import type { MascotPoseName } from '@/scene3d/mascot';

const MascotStage = dynamic(() => import('@/scene3d/MascotStage'), { ssr: false });

const POSES: MascotPoseName[] = ['idle', 'saludo', 'festejo', 'guino', 'sorpresa', 'pensando', 'carta'];

function Lab() {
  const params = useSearchParams();
  const pose = (POSES.find((p) => p === params.get('pose')) ?? 'saludo') as MascotPoseName;
  const dark = params.get('bg') === 'dark';
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4" style={{ background: dark ? '#1A1B24' : '#5BAEE6' }}>
      <MascotStage pose={pose} style={{ width: 560, height: 700 }} />
      <nav className="flex flex-wrap justify-center gap-2 text-sm font-bold">
        {POSES.map((p) => (
          <a key={p} href={`?pose=${p}&bg=${dark ? 'dark' : 'sky'}`} className={`rounded-full px-3 py-1 ${p === pose ? 'bg-white text-ink' : 'bg-black/30 text-white'}`}>
            {p}
          </a>
        ))}
        <a href={`?pose=${pose}&bg=${dark ? 'sky' : 'dark'}`} className="rounded-full bg-black/30 px-3 py-1 text-white">
          {dark ? 'fondo cielo' : 'fondo oscuro'}
        </a>
      </nav>
    </main>
  );
}

/** Development-only mascot lab: every pose at full size, on the TV's sky or the pose sheet's dark backdrop. */
export default function MascotLabPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <Suspense>
      <Lab />
    </Suspense>
  );
}
