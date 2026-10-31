'use client';

import { useEffect, useState } from 'react';
import { ensureSession } from '@/lib/supabase';

/** Authenticated blob URL keeps the subject's original filename out of the question screen. */
export function QuestionPhoto({ path, big }: { path: string; big?: boolean }) {
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setFailed(false);
    setLoaded(null);
    (async () => {
      try {
        const session = await ensureSession();
        const response = await fetch(path, { headers: { authorization: `Bearer ${session.access_token}` }, signal: controller.signal });
        if (!response.ok) throw new Error('photo');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ path, url: objectUrl });
      } catch { if (!controller.signal.aborted) setFailed(true); }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path, retry]);
  const url = loaded?.path === path ? loaded.url : null;
  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-2xl border-4 border-ink bg-white ${big ? 'h-[24vh]' : 'h-56'}`} aria-busy={!url && !failed}>
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Imagen de la pregunta: identificá lo que se muestra" className="h-full w-full object-contain" onError={() => setFailed(true)} />
      ) : failed ? (
        <div className="flex flex-col items-center gap-2 p-3 text-center font-bold" role="status">
          <p>No pudimos cargar la foto.</p>
          <button type="button" className="btn !min-h-10 text-sm" onClick={() => setRetry((n) => n + 1)}>Volver a cargar</button>
        </div>
      ) : <p className="font-bold" role="status">Cargando foto…</p>}
    </div>
  );
}
