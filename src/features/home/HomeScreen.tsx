'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { ERROR_COPY, api } from '@/lib/api';
import type { Avatar } from '@/rooms/model';
import { Sky } from '@/ui/Sky';
import { Toon } from '@/ui/Toon';
import { AvatarEditor, randomAvatar } from '../lobby/AvatarEditor';

const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;

export function HomeScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<Avatar>(randomAvatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = (e: FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!CODE_RE.test(clean)) {
      setError('El código tiene 5 letras y números, como MXQ7K.');
      return;
    }
    router.push(`/s/${clean}`);
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Escribí tu nombre para crear la sala.');
      return;
    }
    setBusy(true);
    const result = await api<{ code: string; pin: string }>('/api/rooms', { body: { name: name.trim(), avatar } });
    setBusy(false);
    if (!result.ok) {
      setError(ERROR_COPY[result.error] ?? 'No pudimos crear la sala. Probá de nuevo.');
      return;
    }
    try {
      sessionStorage.setItem(`megadados-pin-${result.data.code}`, result.data.pin);
    } catch {
      // The PIN is also shown in the lobby while the host stays on the page.
    }
    router.push(`/s/${result.data.code}`);
  };

  return (
    <Sky>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-8" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 4.5rem)' }}>
        <div className="flex flex-1 flex-col items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot/saludo.png" alt="La mascota de Megafy saludando" width={200} height={263} className="h-auto w-48" />
          <Toon as="h1" size="xl" className="-rotate-3">
            Megadados
          </Toon>
          <p className="mt-3 text-center text-lg font-extrabold">La trivia de la Team Building de Megafy</p>
        </div>

        {mode === 'join' ? (
          <form onSubmit={join} className="sticker mt-6 flex flex-col gap-3 p-5">
            <label htmlFor="code" className="text-lg font-extrabold">
              Código de la sala
            </label>
            <input
              id="code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5));
                setError(null);
              }}
              autoComplete="off"
              autoCapitalize="characters"
              inputMode="text"
              placeholder="MXQ7K"
              className="field h-16 text-center font-[family-name:var(--font-display)] !text-4xl tracking-[0.4em]"
            />
            <button type="submit" className="btn btn-go h-16 toon !text-3xl" style={{ '--stroke': '6px', '--drop': '3px' } as React.CSSProperties}>
              ¡Entrar!
            </button>
            <p className="text-center text-sm font-bold text-ink-soft">También podés escanear el QR de la pantalla grande.</p>
          </form>
        ) : (
          <form onSubmit={create} className="sticker mt-6 flex flex-col gap-4 p-5">
            <h2 className="text-xl font-extrabold">Vas a conducir la partida</h2>
            <label htmlFor="host-name" className="sr-only">
              Tu nombre
            </label>
            <input id="host-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" maxLength={24} className="field text-center" />
            <AvatarEditor value={avatar} onChange={setAvatar} />
            <button type="submit" disabled={busy} className="btn btn-go h-14 text-xl">
              {busy ? 'Creando…' : 'Crear la sala'}
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-2xl border-4 border-ink bg-white px-4 py-2 text-center font-extrabold">
            {error}
          </p>
        )}

        <button
          type="button"
          className="btn btn-gold mt-5 h-14 text-lg"
          onClick={() => {
            setMode(mode === 'join' ? 'create' : 'join');
            setError(null);
          }}
        >
          {mode === 'join' ? 'Crear una sala' : 'Tengo un código'}
        </button>
      </main>
    </Sky>
  );
}
