'use client';

import type { PublicGameState } from '@/game';
import { useRoom } from '@/realtime/roomStore';
import { DieAvatar } from '@/ui/DieAvatar';
import { Toon } from '@/ui/Toon';
import { useOwnerName } from './catalog';

const STEPS = [
  { place: 2, height: 110, color: '#8CC2FF' },
  { place: 1, height: 160, color: '#FFD23F' },
  { place: 3, height: 80, color: '#FFB399' },
];

const REASON_COPY: Record<string, string> = {
  rounds: 'Se jugaron todas las rondas.',
  allCrowns: '¡Alguien juntó todas las coronas!',
  timeLimit: 'Se terminó el tiempo.',
  host: 'El host terminó la partida.',
  outOfQuestions: 'Se acabaron las preguntas.',
  noPlayers: 'No quedaron jugadores.',
  catalogUpdated: 'Se actualizó el banco de preguntas. La sala está lista para una revancha.',
};

/** Top three on steps, then everyone else. Teams get their own podium when they played. */
export function Podium({ state, big, scale: size }: { state: PublicGameState; big?: boolean; scale?: number }) {
  const lobby = useRoom((s) => s.lobby);
  const standings = state.teamStandings ?? state.standings;
  const avatarOf = (id: string) => lobby?.players.find((p) => p.id === id)?.avatar;
  const colorOf = (id: string) => lobby?.teams.find((t) => t.id === id)?.color ?? '#9B5CFF';
  const winners = state.finished?.winnerIds ?? [];
  const scale = size ?? (big ? 1.6 : 1);
  const nameOf = useOwnerName();
  const stats = state.stats;
  const category = lobby?.categories.find((c) => c.id === stats?.bestCategory?.categoryId);
  const highlights = stats ? [
    stats.mvp && stats.mvp.points > 0 ? { label: 'Jugador destacado', name: nameOf(stats.mvp.playerId), detail: `${stats.mvp.points} ${state.mode === 'clasico' && state.answerMode !== 'solo' ? 'aciertos' : 'puntos'}` } : null,
    stats.longestStreak ? { label: 'Mejor racha', name: nameOf(stats.longestStreak.ownerId), detail: `${stats.longestStreak.value} aciertos seguidos` } : null,
    stats.fastestAnswer ? { label: 'Respuesta más rápida', name: nameOf(stats.fastestAnswer.playerId), detail: `${(stats.fastestAnswer.ms / 1000).toFixed(2)} s` } : null,
    stats.bestCategory ? { label: 'Categoría estrella', name: category?.name ?? 'Categoría', detail: `${Math.round(stats.bestCategory.rate * 100)} % de aciertos` } : null,
  ].filter((item) => item !== null) : [];

  return (
    <section className="flex flex-col items-center gap-4" aria-label="Podio">
      <Toon size={big ? 'xl' : 'lg'} as="h1" className="text-center">
        {state.finished?.reason === 'catalogUpdated' ? 'Banco actualizado' : winners.length > 1 ? '¡Empate!' : `¡Ganó ${standings[0]?.name ?? ''}!`}
      </Toon>
      {state.finished && <p className="font-extrabold">{REASON_COPY[state.finished.reason]}</p>}
      <div className="flex items-end justify-center gap-3" style={{ minHeight: 230 * scale }}>
        {STEPS.map((step) => {
          const row = standings.find((r) => r.rank === step.place) ?? standings[step.place - 1];
          if (!row) return <div key={step.place} style={{ width: 96 * scale }} />;
          const avatar = avatarOf(row.id);
          return (
            <div key={step.place} className="flex flex-col items-center gap-2" style={{ width: 104 * scale }}>
              {avatar ? (
                <DieAvatar avatar={avatar} size={(step.place === 1 ? 84 : 64) * scale} />
              ) : (
                <span className="rounded-2xl border-4 border-ink" style={{ width: 64 * scale, height: 64 * scale, background: colorOf(row.id) }} />
              )}
              <span className={`max-w-full truncate text-center font-extrabold ${big ? 'text-2xl' : ''}`}>{row.name}</span>
              <div
                className="flex w-full flex-col items-center justify-start rounded-t-2xl border-4 border-b-0 border-ink pt-2"
                style={{ height: step.height * scale, background: step.color }}
              >
                <Toon size={big ? 'lg' : 'md'}>{String(row.rank)}</Toon>
                <span className={`font-extrabold ${big ? 'text-2xl' : ''}`}>{row.points} pts</span>
              </div>
            </div>
          );
        })}
      </div>
      {highlights.length > 0 && (
        <div className={`grid w-full grid-cols-2 gap-3 ${big ? 'max-w-4xl' : ''}`} aria-label="Lo mejor de la partida">
          {highlights.map((item) => (
            <div key={item.label} className="sticker px-3 py-2 text-center">
              <p className="text-sm font-bold text-ink-soft">{item.label}</p>
              <p className={`font-extrabold ${big ? 'text-xl' : ''}`}>{item.name}</p>
              <p className="text-sm font-semibold">{item.detail}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
