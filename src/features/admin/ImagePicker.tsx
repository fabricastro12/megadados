'use client';

import { useState } from 'react';
import { adminSupabase } from '@/lib/adminSupabase';
import type { BankImage } from '@/questions/images';

/** A person chooses and verifies the subject before the image enters the playable bank. */
export function ImagePicker({ onSelect }: { onSelect: (image: BankImage) => void }) {
  const [query, setQuery] = useState('');
  const [images, setImages] = useState<BankImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const search = async () => {
    if (query.trim().length < 2 || busy) return;
    setBusy(true);
    setMessage(null);
    setImages([]);
    try {
      const { data } = await adminSupabase().auth.getSession();
      if (!data.session) throw new Error('session');
      const response = await fetch(`/api/admin/images?q=${encodeURIComponent(query.trim())}`, { headers: { authorization: `Bearer ${data.session.access_token}` } });
      if (!response.ok) throw new Error('search');
      const result = await response.json() as { images: BankImage[] };
      setImages(result.images);
      if (!result.images.length) setMessage('No encontramos fotos. Probá con el nombre completo o en inglés.');
    } catch {
      setMessage('No pudimos consultar el banco de imágenes. Probá de nuevo.');
    } finally { setBusy(false); }
  };
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-panel-alt p-3" aria-label="Banco de imágenes">
      <p className="font-extrabold">Buscar en Wikimedia Commons</p>
      <p className="text-sm font-semibold">Elegí una foto que muestre claramente la respuesta correcta. Revisá la identidad y la fuente antes de guardar.</p>
      <div className="flex gap-2">
        <input className="field" aria-label="Buscar una foto" placeholder="Cantante, monumento, deportista…" value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }} />
        <button className="btn" type="button" disabled={busy || query.trim().length < 2} onClick={() => void search()}>{busy ? 'Buscando…' : 'Buscar'}</button>
      </div>
      {message && <p role="status" className="font-bold">{message}</p>}
      <div className="grid max-h-96 grid-cols-2 gap-3 overflow-auto sm:grid-cols-3">
        {images.map((image) => (
          <article key={image.url} className="flex flex-col gap-2 rounded-xl border-[3px] border-ink bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={image.title} className="h-32 w-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
            <p className="truncate text-sm font-bold" title={image.title}>{image.title}</p>
            <a href={image.source} target="_blank" rel="noreferrer" className="text-sm font-bold underline">Ver fuente y licencia</a>
            <button type="button" className="btn btn-go !min-h-10 text-sm" onClick={() => onSelect(image)}>Usar esta foto</button>
          </article>
        ))}
      </div>
    </section>
  );
}
