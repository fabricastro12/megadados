'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PrivateView } from '@/game';
import { api } from '@/lib/api';
import { ensureSession, supabase } from '@/lib/supabase';
import type { LobbySnapshot } from '@/rooms/model';
import type { StateEnvelope } from '@/server/games/gameService';
import { syncClock } from './clock';
import { useRoom } from './roomStore';

type Snapshot = StateEnvelope & { you: PrivateView | null; seatId: string; role: 'host' | 'player' | 'spectator' };

export type ConnectionStatus = 'loading' | 'needsJoin' | 'ready' | 'gone' | 'error';

const HEARTBEAT_MS = 15_000;

/**
 * Keeps one seat in sync with its room: loads the lobby and game snapshots, subscribes to the
 * private room channel (state, lobby, reactions, Presence) and recovers after any disconnect.
 */
export function useRoomConnection(code: string, opts: { asSpectator?: boolean } = {}) {
  const [status, setStatus] = useState<ConnectionStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const funRef = useRef<RealtimeChannel | null>(null);
  const screensRef = useRef<RealtimeChannel | null>(null);
  const store = useRoom;

  const refresh = useCallback(async (): Promise<boolean> => {
    const lobby = await api<LobbySnapshot & { seatId: string }>(`/api/rooms/${code}`);
    if (!lobby.ok) {
      if (lobby.error === 'not_in_room') {
        setStatus('needsJoin');
        return false;
      }
      if (lobby.error === 'no_room') setStatus('gone');
      else setStatus('error');
      setError(lobby.error);
      return false;
    }
    store.getState().set({ seatId: lobby.data.seatId });
    store.getState().setLobby(lobby.data);
    const snap = await api<Snapshot>(`/api/rooms/${code}/snapshot`);
    if (snap.ok) {
      // A snapshot is authoritative: replace whatever we had, even with an equal version.
      store.getState().set({ game: snap.data, you: snap.data.you, role: snap.data.role });
    } else if (snap.error === 'no_game') {
      store.getState().set({ game: null, you: null });
    }
    setStatus('ready');
    return true;
  }, [code, store]);

  /** Our private view (removed options, own answer) after each state change. */
  const refreshYou = useCallback(async () => {
    const snap = await api<Snapshot>(`/api/rooms/${code}/snapshot`);
    if (snap.ok) store.getState().set({ you: snap.data.you });
  }, [code, store]);

  const subscribe = useCallback(async () => {
    const session = await ensureSession();
    const client = supabase();
    await client.realtime.setAuth(session.access_token);
    channelRef.current?.unsubscribe();
    const seatId = store.getState().seatId ?? session.user.id;
    const channel = client.channel(`room:${code}`, { config: { private: true, presence: { key: seatId } } });
    channel
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        if (store.getState().applyGame(payload as StateEnvelope) && store.getState().role !== 'spectator') void refreshYou();
      })
      .on('broadcast', { event: 'lobby' }, ({ payload }) => store.getState().setLobby(payload as LobbySnapshot))
      .on('presence', { event: 'sync' }, () => {
        store.getState().set({ online: new Set(Object.keys(channel.presenceState())) });
      })
      .subscribe(async (state) => {
        if (state === 'SUBSCRIBED') {
          store.getState().set({ connection: 'live' });
          await channel.track({ seatId, at: Date.now() });
          // Anything broadcast while we were away is covered by a fresh snapshot.
          await refresh();
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
          store.getState().set({ connection: 'reconnecting' });
        }
      });
    channelRef.current = channel;

    funRef.current?.unsubscribe();
    const fun = client.channel(`room:${code}:fun`, { config: { private: true, broadcast: { self: false } } });
    fun.on('broadcast', { event: 'reaction' }, ({ payload }) => store.getState().addReaction(payload as { kind: string; playerId: string })).subscribe();
    funRef.current = fun;

    // The TV and the host also hear who answered (never what) and which lifelines were used.
    screensRef.current?.unsubscribe();
    if (store.getState().role === 'spectator' || store.getState().role === 'host') {
      const screens = client.channel(`room:${code}:screens`, { config: { private: true } });
      screens
        .on('broadcast', { event: 'answered' }, ({ payload }) => {
          const { ownerId } = payload as { ownerId: string };
          const answered = store.getState().answered;
          if (!answered.includes(ownerId)) store.getState().set({ answered: [...answered, ownerId] });
        })
        .subscribe();
      screensRef.current = screens;
    }
  }, [code, refresh, refreshYou, store]);

  const join = useCallback(
    async (body: { as: 'player'; name: string; avatar: { color: string; face: string } } | { as: 'spectator' }) => {
      const result = await api<{ seatId: string }>(`/api/rooms/${code}/join`, { body });
      if (!result.ok) {
        setError(result.error);
        if (result.error === 'no_room') setStatus('gone');
        return false;
      }
      setError(null);
      store.getState().set({ seatId: result.data.seatId });
      if (await refresh()) await subscribe();
      return true;
    },
    [code, refresh, store, subscribe],
  );

  useEffect(() => {
    let cancelled = false;
    store.getState().reset(code);
    (async () => {
      try {
        await ensureSession();
        void syncClock();
        const joined = await refresh();
        if (cancelled) return;
        if (joined) await subscribe();
        else if (opts.asSpectator) await join({ as: 'spectator' });
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    const heartbeat = setInterval(() => {
      if (store.getState().seatId) void api(`/api/rooms/${code}`, { body: { type: 'heartbeat' } });
    }, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && store.getState().seatId) {
        void syncClock(3);
        void refresh();
      }
    };
    const onOnline = () => store.getState().seatId && void subscribe();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      for (const ref of [channelRef, funRef, screensRef]) {
        ref.current?.unsubscribe();
        ref.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  /** Sends an in-game command; the result arrives as a state broadcast. */
  const command = useCallback(
    (body: Record<string, unknown>) => api<{ version: number }>(`/api/rooms/${code}/commands`, { body }),
    [code],
  );
  const lobbyAction = useCallback(
    async (body: Record<string, unknown>) => {
      const result = await api<LobbySnapshot>(`/api/rooms/${code}`, { body });
      if (result.ok) store.getState().setLobby(result.data);
      return result;
    },
    [code, store],
  );
  const start = useCallback(() => api<{ version: number }>(`/api/rooms/${code}/start`, { body: {} }), [code]);

  /** Reactions float on every screen in the room; throttled so nobody floods the channel. */
  const lastReaction = useRef(0);
  const react = useCallback(
    async (kind: string) => {
      if (Date.now() - lastReaction.current < 700) return;
      lastReaction.current = Date.now();
      const seatId = store.getState().seatId ?? '';
      store.getState().addReaction({ kind, playerId: seatId });
      await funRef.current?.send({ type: 'broadcast', event: 'reaction', payload: { kind, playerId: seatId } });
    },
    [store],
  );

  return { status, error, join, command, lobbyAction, start, react, refresh };
}
