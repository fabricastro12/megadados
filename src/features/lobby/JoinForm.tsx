'use client';

import { type FormEvent, useState } from 'react';
import { ERROR_COPY } from '@/lib/api';
import type { Avatar } from '@/rooms/model';
import { Toon } from '@/ui/Toon';
import { AvatarEditor, randomAvatar } from './AvatarEditor';

export function JoinForm({ code, error, onJoin }: { code: string; error: string | null; onJoin: (name: string, avatar: Avatar) => Promise<boolean> }) {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<Avatar>(randomAvatar);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setLocal('Escribí tu nombre.');
      return;
    }
    setBusy(true);
    await onJoin(name.trim(), avatar);
    setBusy(false);
  };

  const message = local ?? (error ? (ERROR_COPY[error] ?? 'No pudimos entrar. Probá de nuevo.') : null);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pb-8" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
      <div className="flex items-baseline gap-2">
        <span className="font-extrabold">Sala</span>
        <Toon size="md" className="tracking-[0.15em]">
          {code}
        </Toon>
      </div>
      <form onSubmit={submit} className="sticker flex flex-col gap-4 p-5">
        <h1 className="text-xl font-extrabold">Armá tu dado</h1>
        <label htmlFor="name" className="sr-only">
          Tu nombre
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setLocal(null);
          }}
          placeholder="Tu nombre"
          maxLength={24}
          autoComplete="nickname"
          className="field text-center"
        />
        <AvatarEditor value={avatar} onChange={setAvatar} />
        <button type="submit" disabled={busy} className="btn btn-go h-16 toon !text-3xl" style={{ '--stroke': '6px', '--drop': '3px' } as React.CSSProperties}>
          {busy ? 'Entrando…' : '¡Entrar!'}
        </button>
      </form>
      {message && (
        <p role="alert" className="sticker px-4 py-3 text-center font-extrabold">
          {message}
        </p>
      )}
    </main>
  );
}
