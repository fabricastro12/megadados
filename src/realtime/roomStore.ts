'use client';

import { create } from 'zustand';
import type { PrivateView } from '@/game';
import type { LobbySnapshot } from '@/rooms/model';
import type { StateEnvelope } from '@/server/games/gameService';

export interface Reaction {
  id: number;
  kind: string;
  playerId: string;
}

export interface RoomStore {
  code: string | null;
  seatId: string | null;
  role: 'host' | 'player' | 'spectator' | null;
  lobby: LobbySnapshot | null;
  game: StateEnvelope | null;
  you: PrivateView | null;
  online: Set<string>;
  connection: 'connecting' | 'live' | 'reconnecting';
  answered: string[];
  reactions: Reaction[];
  setLobby(lobby: LobbySnapshot): void;
  /** Applies a broadcast state only if it is newer than what we hold (a rematch always is). */
  applyGame(game: StateEnvelope): boolean;
  set(partial: Partial<RoomStore>): void;
  addReaction(r: Omit<Reaction, 'id'>): void;
  reset(code: string): void;
}

let reactionId = 0;

export const useRoom = create<RoomStore>((set, get) => ({
  code: null,
  seatId: null,
  role: null,
  lobby: null,
  game: null,
  you: null,
  online: new Set(),
  connection: 'connecting',
  answered: [],
  reactions: [],
  setLobby: (lobby) => {
    const me = lobby.players.find((p) => p.id === get().seatId);
    set({ lobby, role: me?.role ?? get().role });
  },
  applyGame: (game) => {
    const current = get().game;
    if (current && (game.game < current.game || (game.game === current.game && game.version <= current.version))) return false;
    const questionChanged = current?.state.question?.id !== game.state.question?.id;
    set({ game, answered: questionChanged ? [] : get().answered });
    return true;
  },
  set: (partial) => set(partial),
  addReaction: (r) => {
    const reaction = { ...r, id: ++reactionId };
    set({ reactions: [...get().reactions.slice(-24), reaction] });
    setTimeout(() => set({ reactions: get().reactions.filter((x) => x.id !== reaction.id) }), 3200);
  },
  reset: (code) => set({ code, seatId: null, role: null, lobby: null, game: null, you: null, online: new Set(), answered: [], reactions: [] }),
}));
