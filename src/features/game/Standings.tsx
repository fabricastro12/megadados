'use client';

import type { PublicGameState } from '@/game';
import { useRoom } from '@/realtime/roomStore';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { DieAvatar } from '@/ui/DieAvatar';

/** Ranking rows: position, die, name, crowns, points and, after a reveal, the points just won. */
export function Standings({ state, highlight, big, limit }: { state: PublicGameState; highlight?: string | null; big?: boolean; limit?: number }) {
  const lobby = useRoom((s) => s.lobby);
  const teamColor = (id: string) => lobby?.teams.find((t) => t.id === id)?.color;
  const avatarOf = (id: string) => lobby?.players.find((p) => p.id === id)?.avatar;
  const rows = state.standings.slice(0, limit);
  return (
    <ol className={`flex flex-col ${big ? 'gap-3' : 'gap-2'}`} aria-label="Ranking">
      {rows.map((row) => {
        const gained = state.reveal?.results[row.id]?.points ?? 0;
        const avatar = avatarOf(row.id);
        const mine = row.id === highlight;
        return (
          <li
            key={row.id}
            className={`flex items-center gap-3 rounded-2xl border-4 border-ink px-3 shadow-[0_4px_0_#1C2A66] ${mine ? 'bg-cream' : 'bg-white'} ${big ? 'min-h-20 text-2xl' : 'min-h-14'}`}
          >
            <span className={`w-8 text-center font-[family-name:var(--font-display)] ${big ? 'text-3xl' : 'text-xl'}`}>{row.rank}</span>
            {avatar ? (
              <DieAvatar avatar={avatar} size={big ? 56 : 38} />
            ) : (
              <span className="h-9 w-9 rounded-xl border-[3px] border-ink" style={{ background: teamColor(row.id) ?? '#9B5CFF' }} aria-hidden="true" />
            )}
            <span className="flex-1 truncate font-extrabold">
              {row.name}
              {mine && <span className="sr-only"> (vos)</span>}
            </span>
            {row.crowns > 0 && (
              <span className="flex items-center gap-0.5 font-extrabold" aria-label={`${row.crowns} coronas`}>
                <CategoryIcon icon="crown" size={big ? 28 : 20} color="#D9A400" />
                {row.crowns}
              </span>
            )}
            {gained > 0 && <span className="rounded-full bg-go px-2 text-sm font-extrabold text-white">+{gained}</span>}
            <span className={`min-w-14 text-right font-[family-name:var(--font-display)] ${big ? 'text-3xl' : 'text-xl'}`}>{row.points}</span>
          </li>
        );
      })}
    </ol>
  );
}
