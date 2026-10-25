'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameConfig } from '@/game/config';
import { ERROR_COPY, type ApiResult } from '@/lib/api';
import { useRoom } from '@/realtime/roomStore';
import type { Avatar, LobbySnapshot } from '@/rooms/model';
import { DieAvatar } from '@/ui/DieAvatar';
import { Toon } from '@/ui/Toon';
import { AvatarEditor } from './AvatarEditor';
import { PlayerChip } from './PlayerChip';
import { RulesEditor } from './RulesEditor';
import { TeamsBoard } from './TeamsBoard';
import { rulesSummary } from './rulesSummary';

type Action = (body: Record<string, unknown>) => Promise<ApiResult<LobbySnapshot>>;

export function ConnectionPill() {
  const connection = useRoom((s) => s.connection);
  const live = connection === 'live';
  return (
    <span role="status" className="flex items-center gap-2 rounded-full border-[3px] border-ink bg-white px-3 py-1 text-sm font-extrabold">
      <span className={`h-2.5 w-2.5 rounded-full border-2 border-ink ${live ? 'bg-go' : 'animate-pulse bg-gold'}`} />
      {live ? 'Conectado' : 'Reconectando…'}
    </span>
  );
}

function ProfileEditor({ name, avatar, onSave, onClose }: { name: string; avatar: Avatar; onSave: (name: string, avatar: Avatar) => void; onClose: () => void }) {
  const [draftName, setDraftName] = useState(name);
  const [draft, setDraft] = useState(avatar);
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="profile-name" className="sr-only">
        Tu nombre
      </label>
      <input id="profile-name" value={draftName} maxLength={24} onChange={(e) => setDraftName(e.target.value)} className="field text-center" />
      <AvatarEditor value={draft} onChange={setDraft} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-go"
          disabled={!draftName.trim()}
          onClick={() => {
            onSave(draftName.trim(), draft);
            onClose();
          }}
        >
          Guardar
        </button>
      </div>
    </div>
  );
}

export function LobbyScreen({ lobbyAction, start }: { lobbyAction: Action; start: () => Promise<ApiResult<{ version: number }>> }) {
  const lobby = useRoom((s) => s.lobby)!;
  const seatId = useRoom((s) => s.seatId);
  const online = useRoom((s) => s.online);
  const me = lobby.players.find((p) => p.id === seatId);
  const isHost = me?.role === 'host';
  const host = lobby.players.find((p) => p.role === 'host');
  const [editing, setEditing] = useState(false);
  const [showRules, setShowRules] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [claimPin, setClaimPin] = useState('');
  const hostAwaySince = useRef<number | null>(null);
  const [hostAway, setHostAway] = useState(false);
  const players = lobby.players.filter((p) => p.role !== 'spectator');

  useEffect(() => {
    try {
      setPin(sessionStorage.getItem(`megadados-pin-${lobby.room.code}`));
    } catch {
      setPin(null);
    }
  }, [lobby.room.code]);

  // Offer to take over when the host has been gone from Presence for a while.
  useEffect(() => {
    const away = !!host && !online.has(host.id);
    if (!away) {
      hostAwaySince.current = null;
      setHostAway(false);
      return;
    }
    hostAwaySince.current ??= Date.now();
    const id = setTimeout(() => setHostAway(true), Math.max(0, 45_000 - (Date.now() - hostAwaySince.current)));
    return () => clearTimeout(id);
  }, [host, online]);

  const run = async (body: Record<string, unknown>) => {
    const result = await lobbyAction(body);
    setMessage(result.ok ? null : (ERROR_COPY[result.error] ?? 'No se pudo guardar el cambio.'));
    return result;
  };

  const saveConfig = (config: GameConfig) => {
    useRoom.getState().setLobby({ ...lobby, room: { ...lobby.room, config } });
    void run({ type: 'updateConfig', config });
  };

  const config = lobby.room.config;
  const canMove = (playerId: string) => isHost || (config.teams.assignment === 'choose' && playerId === seatId);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 pb-10" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
      <header className="flex items-center gap-3 pr-14">
        <div className="flex items-baseline gap-2">
          <span className="font-extrabold">Sala</span>
          <Toon size="md" className="tracking-[0.15em]">
            {lobby.room.code}
          </Toon>
        </div>
        <ConnectionPill />
      </header>

      {me && (
        <section className="sticker flex flex-col gap-3 p-4" aria-label="Tu dado">
          {editing ? (
            <ProfileEditor
              name={me.name}
              avatar={me.avatar}
              onClose={() => setEditing(false)}
              onSave={(name, avatar) => void run({ type: 'updateProfile', name, avatar })}
            />
          ) : (
            <div className="flex items-center gap-4">
              <DieAvatar avatar={me.avatar} size={84} />
              <div className="flex-1">
                <p className="text-sm font-bold text-ink-soft">Jugás como</p>
                <p className="text-2xl font-extrabold">{me.name}</p>
              </div>
              <button type="button" className="btn !min-h-11 text-sm" onClick={() => setEditing(true)}>
                Cambiar
              </button>
            </div>
          )}
        </section>
      )}

      <section className="sticker p-4" aria-label="Jugadores en la sala">
        <h2 className="mb-3 text-lg font-extrabold">En la sala: {players.length}</h2>
        <ul className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-6">
          {players.map((p) => (
            <li key={p.id} className="relative">
              <PlayerChip player={p} online={online.has(p.id)} you={p.id === seatId} />
              {isHost && p.id !== seatId && (
                <button
                  type="button"
                  aria-label={`Sacar a ${p.name} de la sala`}
                  onClick={() => void run({ type: 'kick', playerId: p.id })}
                  className="absolute -right-1 -top-2 flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-ink bg-wrong text-white"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {config.teams.enabled && lobby.teams.length > 0 && (
        <section className="sticker p-4">
          <TeamsBoard
            lobby={lobby}
            online={online}
            canMove={canMove}
            onMove={(playerId, teamId) => void run({ type: 'assignTeam', playerId, teamId })}
            onShuffle={isHost ? () => void run({ type: 'shuffleTeams' }) : undefined}
          />
        </section>
      )}

      {isHost ? (
        <>
          {pin && (
            <p className="sticker px-4 py-3 text-center font-extrabold">
              Tu PIN de host es <span className="font-[family-name:var(--font-display)] text-2xl tracking-widest">{pin}</span>. Sirve para recuperar el
              control desde otro equipo.
            </p>
          )}
          <section className="sticker p-4">
            <button type="button" className="flex w-full items-center justify-between text-left" aria-expanded={showRules} onClick={() => setShowRules(!showRules)}>
              <h2 className="text-lg font-extrabold">Reglas</h2>
              <span className="font-bold text-ink-soft">{showRules ? 'Ocultar' : 'Mostrar'}</span>
            </button>
            {showRules ? (
              <div className="mt-4">
                <RulesEditor config={config} categories={lobby.categories} onChange={saveConfig} />
              </div>
            ) : (
              <p className="mt-2 font-semibold text-ink-soft">{rulesSummary(config)}</p>
            )}
          </section>
          <button
            type="button"
            disabled={starting}
            className="btn btn-go toon h-20 !text-4xl"
            style={{ '--stroke': '7px', '--drop': '4px' } as React.CSSProperties}
            onClick={async () => {
              setStarting(true);
              const result = await start();
              setStarting(false);
              if (!result.ok) setMessage(ERROR_COPY[result.error] ?? 'No se pudo empezar la partida.');
            }}
          >
            {starting ? 'Arrancando…' : lobby.room.status === 'finished' ? '¡Revancha!' : '¡Empezar!'}
          </button>
        </>
      ) : (
        <section className="flex flex-col items-center gap-2 text-center">
          <Toon size="sm" className="!text-[1.75rem]">
            Esperando a {host?.name ?? 'el host'}
          </Toon>
          <p className="max-w-sm font-bold">{rulesSummary(config)}</p>
          {hostAway && (
            <div className="sticker mt-3 flex w-full flex-col gap-2 p-4">
              <p className="font-extrabold">{host?.name ?? 'El host'} se desconectó. Podés tomar el control para que la partida siga.</p>
              <button type="button" className="btn btn-gold" onClick={() => void run({ type: 'claimHost' })}>
                Tomar el control
              </button>
            </div>
          )}
          <details className="mt-2 text-sm font-bold">
            <summary className="cursor-pointer">Tengo el PIN del host</summary>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run({ type: 'claimHost', pin: claimPin });
              }}
            >
              <label htmlFor="claim-pin" className="sr-only">
                PIN del host
              </label>
              <input id="claim-pin" inputMode="numeric" maxLength={4} value={claimPin} onChange={(e) => setClaimPin(e.target.value.replace(/\D/g, ''))} className="field w-28 text-center" />
              <button type="submit" className="btn">
                Usar PIN
              </button>
            </form>
          </details>
        </section>
      )}

      {message && (
        <p role="alert" className="sticker px-4 py-3 text-center font-extrabold">
          {message}
        </p>
      )}
    </main>
  );
}
