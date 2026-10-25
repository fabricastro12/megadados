'use client';

import { useEffect, useState } from 'react';
import type { Lifeline } from '@/game/config';
import { LIFELINES } from '@/game/config';
import { ERROR_COPY } from '@/lib/api';
import type { useRoomConnection } from '@/realtime/useRoomConnection';
import { useRoom } from '@/realtime/roomStore';
import { ConnectionPill } from '@/features/lobby/LobbyScreen';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { Toon } from '@/ui/Toon';
import { CROWN_LOOK, useCatalog, useOwnerName } from './catalog';
import { Countdown } from './Countdown';
import { HostBar } from './HostBar';
import { Lifelines } from './Lifelines';
import { Podium } from './Podium';
import { type OptionState, QuestionView } from './QuestionView';
import { ReactionBar, ReactionLayer } from './Reactions';
import { Standings } from './Standings';
import { useAutoTick } from './useAutoTick';
import { Wheel } from './Wheel';

type Connection = ReturnType<typeof useRoomConnection>;

const GAME_ERRORS: Record<string, string> = {
  ...ERROR_COPY,
  not_your_turn: 'Ahora no te toca.',
  already_answered: 'Ya respondiste esta.',
  use_vote: 'En este modo tu equipo vota.',
  lifeline_used: 'Ya usaste ese comodín.',
};

function Mascot({ pose, size = 120, className = '' }: { pose: 'saludo' | 'festejo' | 'carta' | 'sorpresa' | 'cabeza'; size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/mascot/${pose}.png`} alt="" width={size} height={size} className={`pointer-events-none select-none object-contain ${className}`} />;
}

/** One phone during a game: follows the server's phase and only offers what this seat may do. */
export function PlayerGame({ connection, onLeave }: { connection: Connection; onLeave: () => void }) {
  const game = useRoom((s) => s.game)!;
  const you = useRoom((s) => s.you);
  const seatId = useRoom((s) => s.seatId);
  const role = useRoom((s) => s.role);
  const lobby = useRoom((s) => s.lobby);
  const look = useCatalog();
  const nameOf = useOwnerName();
  const [picked, setPicked] = useState<{
    questionId: string;
    choice: number;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useAutoTick(connection.command, role === 'host');

  const s = game.state;
  const phase = s.phase === 'paused' ? (s.pausedPhase ?? 'question') : s.phase;
  const ownerId = you?.ownerId ?? null;
  const q = s.question;

  useEffect(() => setPicked(null), [q?.id]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const send = async (body: Record<string, unknown>) => {
    const result = await connection.command(body);
    if (!result.ok && result.error !== 'deadline_not_reached') setToast(GAME_ERRORS[result.error] ?? 'No se pudo. Probá de nuevo.');
    return result;
  };

  const segments = [...s.categories.map((c) => look(c)), CROWN_LOOK];
  const myScore = ownerId ? s.scores[ownerId] : undefined;
  const myRank = s.standings.find((r) => r.id === ownerId)?.rank;
  const spinnerName = nameOf(s.spinnerId);
  const canAnswerNow =
    !!q &&
    !!ownerId &&
    q.eligible.includes(ownerId) &&
    (s.answerMode !== 'captain' || s.captainId === seatId) &&
    !q.answeredBy.includes(ownerId) &&
    you?.myChoice == null &&
    picked?.questionId !== q.id &&
    s.phase === 'question';

  const header = (
    <header className="flex items-center gap-2 pr-14">
      <span className="rounded-full border-[3px] border-ink bg-white px-3 py-1 text-sm font-extrabold">
        Ronda {Math.min(s.round + 1, s.totalRounds)} de {s.totalRounds}
      </span>
      {myScore && (
        <span className="flex items-center gap-1 rounded-full border-[3px] border-ink bg-white px-3 py-1 text-sm font-extrabold">
          {myScore.points} pts
          {myScore.crowns.length > 0 && (
            <>
              <CategoryIcon icon="crown" size={16} color="#D9A400" />
              {myScore.crowns.length}
            </>
          )}
          {myRank && <span className="text-ink-soft">· {myRank}º</span>}
        </span>
      )}
      <span className="ml-auto">
        <ConnectionPill />
      </span>
    </header>
  );

  let body: React.ReactNode = null;
  if (s.phase === 'finished') {
    body = (
      <div className="flex flex-col gap-5">
        <Podium state={s} />
        <Standings state={s} highlight={ownerId} />
        <button type="button" className="btn btn-gold" onClick={onLeave}>
          Volver a la sala
        </button>
      </div>
    );
  } else if (phase === 'awaitingSpin' || phase === 'spinning') {
    const mine = s.spinnerId === seatId;
    body = (
      <div className="flex flex-col items-center gap-5">
        <Toon size="md" as="h1" className="text-center">
          {phase === 'spinning' ? '¡Gira, gira!' : mine ? '¡Te toca girar!' : `Gira ${spinnerName}`}
        </Toon>
        <Wheel segments={segments} spin={s.spin} size={300} pausedAt={s.pausedAt} />
        {phase === 'awaitingSpin' && mine && (
          <button
            type="button"
            className="btn btn-go toon h-20 w-full !text-4xl"
            style={{ '--stroke': '7px', '--drop': '4px' } as React.CSSProperties}
            onClick={() => void send({ type: 'spin' })}
          >
            ¡Girar!
          </button>
        )}
        {phase === 'awaitingSpin' && (
          <div className="flex items-center gap-2 font-bold">
            <Countdown deadline={s.phaseDeadline} total={0} size={40} /> {mine ? 'Si no girás, gira sola.' : 'La ruleta gira sola si tarda.'}
          </div>
        )}
      </div>
    );
  } else if (phase === 'crownPick' && s.crownPick) {
    const mine = s.spinnerId === seatId;
    body = (
      <div className="flex flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <CategoryIcon icon="crown" size={72} color="#D9A400" />
          <Toon size="md" as="h1" className="text-center">
            {mine ? '¡Corona! Elegí la categoría' : `${spinnerName} elige la categoría`}
          </Toon>
          <p className="text-center font-bold">La pregunta vale el doble.</p>
        </div>
        <Countdown deadline={s.phaseDeadline} total={12} />
        <div className="grid w-full grid-cols-2 gap-3">
          {s.crownPick.options.map((id) => {
            const c = look(id);
            return (
              <button
                key={id}
                type="button"
                disabled={!mine}
                onClick={() => void send({ type: 'pickCategory', categoryId: id })}
                className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-[20px] border-4 border-ink px-2 text-white shadow-[inset_0_-6px_0_rgba(0,0,0,0.18),0_5px_0_#1C2A66] disabled:opacity-80"
                style={{ background: c.color }}
              >
                <CategoryIcon icon={c.icon} size={34} />
                <span
                  className="toon text-lg"
                  style={
                    {
                      '--stroke': '4px',
                      '--drop': '2px',
                    } as React.CSSProperties
                  }
                >
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  } else if ((phase === 'question' || phase === 'reveal') && q && game.question) {
    const reveal = phase === 'reveal' ? s.reveal : null;
    const mine = ownerId ? reveal?.results[ownerId] : undefined;
    const choice = you?.myChoice ?? (picked?.questionId === q.id ? picked.choice : null);
    const removed = you?.removedOptions ?? [];
    const states: OptionState[] = [0, 1, 2, 3].map((i) => {
      if (reveal) return i === reveal.correct ? 'correct' : i === choice ? 'wrong' : 'dim';
      if (removed.includes(i)) return 'removed';
      if (choice === i) return 'picked';
      return 'idle';
    });
    const audienceOpen = !!q.audience && !!ownerId && !q.eligible.includes(ownerId) && s.phase === 'question';
    const watching = !!ownerId && !q.eligible.includes(ownerId);
    const answerType = s.answerMode === 'vote' ? 'vote' : 'answer';
    const done = q.answeredBy.length;
    const total = q.eligible.length;
    const teammates = s.teams.find((t) => t.id === ownerId)?.memberIds.filter((id) => s.players.some((p) => p.id === id && p.active)) ?? [];
    const teamVotes = teammates.filter((id) => q.votedBy.includes(id)).length;
    const enabledLifelines = LIFELINES.filter((l) => s.mode === 'clasico' || l !== 'audience').filter((l) => lobby?.room.config.lifelines[l]);

    body = (
      <div className="flex flex-col gap-4">
        <QuestionView
          content={game.question}
          look={look(q.categoryId)}
          crown={q.isCrown}
          deadline={reveal ? null : (you?.myDeadline ?? q.deadline)}
          totalSeconds={s.questionSeconds}
          states={states}
          onPick={
            canAnswerNow
              ? (i) => {
                  setPicked({ questionId: q.id, choice: i });
                  void send({
                    type: answerType,
                    questionId: q.id,
                    choice: i,
                  }).then((r) => {
                    if (!r.ok) setPicked(null);
                  });
                }
              : audienceOpen
                ? (i) =>
                    void send({
                      type: 'audienceVote',
                      questionId: q.id,
                      choice: i,
                    })
                : undefined
          }
          footer={
            !reveal && (
              <p className="text-center font-extrabold" aria-live="polite">
                {watching
                  ? audienceOpen
                    ? `¡${nameOf(q.eligible[0])} pidió ayuda! Tocá la que te parece.`
                    : `Responde ${s.captainId ? nameOf(s.captainId) : nameOf(q.eligible[0])}`
                  : choice === null && ownerId && q.answeredBy.includes(ownerId)
                    ? `Pasaste esta. Ya respondieron ${done} de ${total}.`
                    : choice !== null
                      ? s.mode === 'ronda'
                        ? `Respuesta enviada. Ya respondieron ${done} de ${total}.`
                        : s.answerMode === 'vote'
                          ? `Votaste. Tu equipo lleva ${teamVotes} de ${teammates.length} votos.`
                          : 'Respuesta enviada.'
                      : s.answerMode === 'captain' && s.captainId !== seatId
                        ? `Responde ${nameOf(s.captainId)}, tu capitán.`
                        : s.mode === 'ronda'
                          ? `Ya respondieron ${done} de ${total}`
                          : s.answerMode === 'vote'
                            ? '¡Les toca! Votá la respuesta con tu equipo.'
                            : '¡Te toca!'}
              </p>
            )
          }
        />
        {q.audience && (
          <div className="sticker grid grid-cols-4 gap-2 p-3" aria-label="Votos del público">
            {q.audience.percentages.map((p, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="flex h-20 w-full items-end overflow-hidden rounded-lg border-[3px] border-ink bg-panel-alt">
                  <div className="w-full bg-[#FF5DAA]" style={{ height: `${p}%` }} />
                </div>
                <span className="font-extrabold">
                  {'ABCD'[i]} {p}%
                </span>
              </div>
            ))}
          </div>
        )}
        {reveal ? (
          <div className="sticker pop-in flex items-center gap-3 p-4" role="status">
            <Mascot pose={mine?.correct ? 'festejo' : 'sorpresa'} size={96} />
            <div className="flex-1">
              <Toon size="sm" as="p">
                {mine ? (mine.passed ? 'Pasaste' : mine.correct ? '¡Correcto!' : mine.choice === null ? 'Sin respuesta' : 'Incorrecto') : 'Respuesta'}
              </Toon>
              {mine && mine.points > 0 && <p className="text-xl font-extrabold text-go-shade">+{mine.points} puntos</p>}
              {mine?.crownAwarded && (
                <p className="flex items-center gap-1 font-extrabold">
                  <CategoryIcon icon="crown" size={20} color="#D9A400" /> ¡Ganaste la corona de {look(mine.crownAwarded).name}!
                </p>
              )}
              {game.question.explanation && <p className="mt-1 text-sm font-semibold text-ink-soft">{game.question.explanation}</p>}
            </div>
          </div>
        ) : (
          !watching &&
          enabledLifelines.length > 0 && (
            <Lifelines
              enabled={enabledLifelines as Lifeline[]}
              left={you?.lifelinesLeft ?? []}
              disabled={!canAnswerNow}
              onUse={(l) => void send({ type: 'useLifeline', lifeline: l })}
            />
          )
        )}
      </div>
    );
  } else if (phase === 'roundResults') {
    body = (
      <div className="flex flex-col gap-4">
        <Toon size="md" as="h1" className="text-center">
          Así va la cosa
        </Toon>
        <Standings state={s} highlight={ownerId} />
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 pb-6" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
      {header}
      <div className="flex-1">{body}</div>
      {s.phase !== 'finished' && <ReactionBar onReact={(k) => void connection.react(k)} />}
      {role === 'host' && <HostBar command={connection.command} />}
      {s.phase === 'paused' && (
        <div
          className="fixed inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-ink/70 px-6 text-center"
          role="dialog"
          aria-modal="true"
          aria-label="Pausa"
        >
          <Mascot pose="cabeza" size={140} />
          <Toon size="lg">Pausa</Toon>
          <p className="font-extrabold text-white">El host frenó la partida. Seguimos en un ratito.</p>
          {role === 'host' && (
            <button type="button" className="btn btn-go" onClick={() => void send({ type: 'resume' })}>
              Seguir
            </button>
          )}
        </div>
      )}
      {toast && (
        <p role="alert" className="sticker pop-in fixed bottom-24 left-1/2 z-40 -translate-x-1/2 px-4 py-2 font-extrabold">
          {toast}
        </p>
      )}
      <ReactionLayer />
    </main>
  );
}
