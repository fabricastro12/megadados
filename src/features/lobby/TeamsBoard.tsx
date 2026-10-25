'use client';

import { useState } from 'react';
import type { LobbySnapshot } from '@/rooms/model';
import { DieAvatar } from '@/ui/DieAvatar';

/**
 * Team columns. Drag a name onto another team (mouse or touch-and-drag on desktop browsers),
 * or use its select on phones. `canMove` decides whose chips are movable.
 */
export function TeamsBoard({
  lobby,
  online,
  canMove,
  onMove,
  onShuffle,
}: {
  lobby: LobbySnapshot;
  online: Set<string>;
  canMove: (playerId: string) => boolean;
  onMove: (playerId: string, teamId: string) => void;
  onShuffle?: () => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const players = lobby.players.filter((p) => p.role !== 'spectator');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-extrabold">Equipos</h3>
        {onShuffle && (
          <button type="button" className="btn !min-h-10 text-sm" onClick={onShuffle}>
            Mezclar al azar
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {lobby.teams.map((team) => (
          <section
            key={team.id}
            aria-label={`Equipo ${team.name}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(team.id);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData('text/player');
              if (id) onMove(id, team.id);
            }}
            className="overflow-hidden rounded-2xl border-4 border-ink bg-white"
            style={{ outline: over === team.id ? '4px dashed #2CC56F' : undefined, outlineOffset: 3 }}
          >
            <div className="border-b-4 border-ink px-3 py-1.5 font-extrabold text-white" style={{ background: team.color, textShadow: '0 2px 0 #1C2A66' }}>
              {team.name}
            </div>
            <ul className="flex min-h-14 flex-col gap-1 p-2">
              {players
                .filter((p) => p.teamId === team.id)
                .map((p) => (
                  <li
                    key={p.id}
                    draggable={canMove(p.id)}
                    onDragStart={(e) => e.dataTransfer.setData('text/player', p.id)}
                    className={`flex items-center gap-2 rounded-xl px-1 py-0.5 ${canMove(p.id) ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  >
                    <DieAvatar avatar={p.avatar} size={30} dim={!online.has(p.id)} />
                    <span className="flex-1 truncate font-extrabold">{p.name}</span>
                    {canMove(p.id) && (
                      <select
                        aria-label={`Equipo de ${p.name}`}
                        value={p.teamId ?? ''}
                        onChange={(e) => onMove(p.id, e.target.value)}
                        className="rounded-lg border-2 border-ink bg-panel-alt px-1 text-sm font-bold"
                      >
                        {lobby.teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
