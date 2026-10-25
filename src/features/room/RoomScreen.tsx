'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ERROR_COPY } from '@/lib/api';
import { useRoomConnection } from '@/realtime/useRoomConnection';
import { useRoom } from '@/realtime/roomStore';
import { JoinForm } from '@/features/lobby/JoinForm';
import { LobbyScreen } from '@/features/lobby/LobbyScreen';
import { PlayerGame } from '@/features/game/PlayerGame';
import { Sky } from '@/ui/Sky';
import { Toon } from '@/ui/Toon';

export function StatusScreen({ title, detail, action = true }: { title: string; detail?: string; action?: boolean }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <Toon size="md">{title}</Toon>
      {detail && <p className="font-bold">{detail}</p>}
      {action && (
        <Link href="/" className="btn btn-gold">
          Volver al inicio
        </Link>
      )}
    </main>
  );
}

/** A phone in the room: joins, then follows the room from lobby to podium. */
export function RoomScreen({ code }: { code: string }) {
  const connection = useRoomConnection(code);
  const lobby = useRoom((s) => s.lobby);
  const game = useRoom((s) => s.game);
  // After the podium, a phone goes back to the lobby; the next game brings it back in.
  const [left, setLeft] = useState<string | null>(null);
  const inGame = !!game && (game.state.phase !== 'finished' || left !== `${game.game}:${game.version}`);

  let screen: React.ReactNode;
  if (connection.status === 'loading') screen = <StatusScreen title="Entrando…" action={false} />;
  else if (connection.status === 'gone') screen = <StatusScreen title="Sala cerrada" detail={ERROR_COPY.no_room} />;
  else if (connection.status === 'error') screen = <StatusScreen title="Algo falló" detail="No pudimos conectar con la sala. Revisá tu conexión y recargá." />;
  else if (connection.status === 'needsJoin')
    screen = <JoinForm code={code} error={connection.error} onJoin={(name, avatar) => connection.join({ as: 'player', name, avatar })} />;
  else if (!lobby) screen = <StatusScreen title="Entrando…" action={false} />;
  else if (inGame)
    screen = (
      <PlayerGame
        connection={connection}
        onLeave={() => {
          setLeft(`${game.game}:${game.version}`);
          void connection.refresh();
        }}
      />
    );
  else screen = <LobbyScreen lobbyAction={connection.lobbyAction} start={connection.start} />;

  return <Sky>{screen}</Sky>;
}
