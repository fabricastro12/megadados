import type { LobbyPlayer } from '@/rooms/model';
import { DieAvatar } from '@/ui/DieAvatar';

export function PlayerChip({ player, online, you, size = 44 }: { player: LobbyPlayer; online: boolean; you?: boolean; size?: number }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div className="relative">
        <DieAvatar avatar={player.avatar} size={size} dim={!online} title={`${player.name}, ${online ? 'conectado' : 'desconectado'}`} />
        {player.role === 'host' && (
          <svg className="absolute -top-3 left-1/2 -translate-x-1/2" width="26" height="26" viewBox="0 0 24 24" role="img" aria-label="Host">
            <path d="M3 18 5 7l4.5 4.5L12 5l2.5 6.5L19 7l2 11z" fill="#FFD23F" stroke="#1C2A66" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span className={`max-w-[6.5rem] truncate text-sm font-extrabold ${online ? '' : 'text-ink-soft'}`}>
        {player.name}
        {you ? ' (vos)' : ''}
      </span>
      {!online && <span className="text-xs font-bold text-ink-soft">Afuera</span>}
    </div>
  );
}
