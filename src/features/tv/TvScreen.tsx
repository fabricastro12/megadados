'use client';

import { useEffect, useState } from 'react';
import { CROWN_LOOK, useCatalog, useOwnerName } from '@/features/game/catalog';
import { Countdown } from '@/features/game/Countdown';
import { Podium } from '@/features/game/Podium';
import { type OptionState, QuestionView } from '@/features/game/QuestionView';
import { ReactionLayer } from '@/features/game/Reactions';
import { Standings } from '@/features/game/Standings';
import { useAutoTick } from '@/features/game/useAutoTick';
import { Wheel } from '@/features/game/Wheel';
import { rulesSummary } from '@/features/lobby/rulesSummary';
import { StatusScreen } from '@/features/room/RoomScreen';
import { serverNow } from '@/realtime/clock';
import { useRoomConnection } from '@/realtime/useRoomConnection';
import { useRoom } from '@/realtime/roomStore';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { DieAvatar } from '@/ui/DieAvatar';
import { Qr } from '@/ui/Qr';
import { Sky } from '@/ui/Sky';
import { Toon } from '@/ui/Toon';

const PODIUM_MS = 90_000;

/** Keeps big pieces (the wheel) inside short screens such as laptops. */
function useViewportHeight(): number {
  const [height, setHeight] = useState(900);
  useEffect(() => {
    const update = () => setHeight(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return height;
}

function useJoinUrl(code: string): string {
  const [url, setUrl] = useState('');
  useEffect(() => setUrl(`${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}/s/${code}`), [code]);
  return url;
}

function TvLobby({ code }: { code: string }) {
  const lobby = useRoom((s) => s.lobby)!;
  const online = useRoom((s) => s.online);
  const url = useJoinUrl(code);
  const players = lobby.players.filter((p) => p.role !== 'spectator');
  return (
    <main className="grid min-h-dvh grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 p-12">
      <section className="flex flex-col items-center justify-center gap-6 text-center">
        <Toon size="xl" as="h1">
          ¡Sumate!
        </Toon>
        {url && <Qr value={url} size={300} />}
        <p className="text-2xl font-extrabold">Escaneá el QR o entrá en</p>
        <p className="rounded-2xl border-4 border-ink bg-white px-5 py-2 text-2xl font-extrabold">{url.replace(/^https?:\/\//, '').replace(/\/s\/.*$/, '')}</p>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-extrabold">con el código</span>
          <Toon size="xxl" className="tracking-[0.12em]">
            {code}
          </Toon>
        </div>
      </section>
      <section className="flex flex-col gap-6">
        <div className="sticker flex-1 p-8">
          <h2 className="mb-6 text-3xl font-extrabold">En la sala: {players.length}</h2>
          <ul className="grid grid-cols-4 gap-x-4 gap-y-8 xl:grid-cols-6">
            {players.map((p) => (
              <li key={p.id} className="pop-in flex flex-col items-center gap-2 text-center">
                <DieAvatar avatar={p.avatar} size={96} dim={!online.has(p.id)} />
                <span className="max-w-full truncate text-xl font-extrabold">{p.name}</span>
              </li>
            ))}
          </ul>
          {players.length === 0 && <p className="text-2xl font-bold text-ink-soft">Todavía no entró nadie. ¡Sacá el celu!</p>}
        </div>
        <div className="flex items-center gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot/saludo.png" alt="" width={170} height={170} className="object-contain" />
          <p className="sticker flex-1 p-5 text-2xl font-bold">{rulesSummary(lobby.room.config)}</p>
        </div>
      </section>
    </main>
  );
}

function AnsweredStrip({ ids }: { ids: string[] }) {
  const lobby = useRoom((s) => s.lobby);
  return (
    <div className="flex flex-wrap items-center justify-center gap-3" aria-live="polite">
      {ids.map((id) => {
        const avatar = lobby?.players.find((p) => p.id === id)?.avatar;
        return avatar ? <DieAvatar key={id} avatar={avatar} size={56} /> : null;
      })}
    </div>
  );
}

function TvGame({ command }: { command: ReturnType<typeof useRoomConnection>['command'] }) {
  useAutoTick(command, true);
  const viewport = useViewportHeight();
  const game = useRoom((s) => s.game)!;
  const lobby = useRoom((s) => s.lobby);
  const look = useCatalog();
  const nameOf = useOwnerName();
  const s = game.state;
  const phase = s.phase === 'paused' ? (s.pausedPhase ?? 'question') : s.phase;
  const q = s.question;
  const segments = [...s.categories.map((c) => look(c)), CROWN_LOOK];

  let main: React.ReactNode = null;
  let side = true;
  if (s.phase === 'finished') {
    side = false;
    main = (
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-end gap-10">
        <Podium state={s} big />
        <Standings state={s} limit={8} />
      </div>
    );
  } else if (phase === 'awaitingSpin' || phase === 'spinning') {
    main = (
      <div className="flex flex-col items-center gap-6">
        <Toon size="xl" as="h1">
          {phase === 'spinning' ? '¡Gira, gira!' : `Gira ${nameOf(s.spinnerId)}`}
        </Toon>
        <Wheel segments={segments} spin={s.spin} size={Math.min(560, Math.round(viewport * 0.6))} pausedAt={s.pausedAt} />
        {phase === 'awaitingSpin' && <Countdown deadline={s.phaseDeadline} total={0} size={72} />}
      </div>
    );
  } else if (phase === 'crownPick' && s.crownPick) {
    main = (
      <div className="flex flex-col items-center gap-8">
        <CategoryIcon icon="crown" size={140} color="#D9A400" />
        <Toon size="xl" as="h1" className="text-center">
          ¡Corona! {nameOf(s.spinnerId)} elige la categoría
        </Toon>
        <div className="flex flex-wrap justify-center gap-5">
          {s.crownPick.options.map((id) => {
            const c = look(id);
            return (
              <div key={id} className="flex min-w-48 flex-col items-center gap-2 rounded-3xl border-4 border-ink p-5 text-white shadow-[0_6px_0_#1C2A66]" style={{ background: c.color }}>
                <CategoryIcon icon={c.icon} size={56} />
                <Toon size="sm">{c.name}</Toon>
              </div>
            );
          })}
        </div>
        <Countdown deadline={s.phaseDeadline} total={12} size={96} />
      </div>
    );
  } else if ((phase === 'question' || phase === 'reveal') && q && game.question) {
    const reveal = phase === 'reveal' ? s.reveal : null;
    const pickers = (choice: number) =>
      Object.entries(reveal?.results ?? {})
        .filter(([, r]) => r.choice === choice)
        .map(([id]) => id);
    const states: OptionState[] = [0, 1, 2, 3].map((i) => (reveal ? (i === reveal.correct ? 'correct' : 'dim') : 'idle'));
    main = (
      <QuestionView
        big
        content={game.question}
        look={look(q.categoryId)}
        crown={q.isCrown}
        deadline={reveal ? null : s.phaseDeadline}
        totalSeconds={s.questionSeconds}
        states={states}
        extra={(i) =>
          reveal ? (
            <span className="flex -space-x-3">
              {pickers(i).map((id) => {
                const avatar = lobby?.players.find((p) => p.id === id)?.avatar;
                return avatar ? <DieAvatar key={id} avatar={avatar} size={48} /> : null;
              })}
            </span>
          ) : null
        }
        footer={
          reveal ? (
            game.question.explanation && <p className="sticker px-8 py-5 text-2xl font-bold">{game.question.explanation}</p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-2xl font-extrabold">
                {s.mode === 'ronda' ? `Respondieron ${q.answeredBy.length} de ${q.eligible.length}` : `Responde ${s.captainId ? nameOf(s.captainId) : nameOf(q.eligible[0])}`}
              </p>
              {s.mode === 'ronda' && <AnsweredStrip ids={q.answeredBy} />}
              {q.audience && (
                <div className="sticker grid w-full max-w-3xl grid-cols-4 gap-4 p-5">
                  {q.audience.percentages.map((p, i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                      <div className="flex h-40 w-full items-end overflow-hidden rounded-xl border-4 border-ink bg-panel-alt">
                        <div className="w-full bg-[#FF5DAA] transition-[height]" style={{ height: `${p}%` }} />
                      </div>
                      <span className="text-2xl font-extrabold">
                        {'ABCD'[i]} {p}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        }
      />
    );
  } else if (phase === 'roundResults') {
    side = false;
    main = (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <Toon size="xl" as="h1" className="text-center">
          Así va la cosa
        </Toon>
        <Standings state={s} big limit={10} />
      </div>
    );
  }

  return (
    <main className={`grid min-h-dvh gap-10 p-10 ${side ? 'grid-cols-[minmax(0,1fr)_380px]' : ''}`}>
      <div className="flex flex-col justify-center">
        <div className="mb-6 flex items-center gap-4">
          <span className="rounded-full border-4 border-ink bg-white px-5 py-1.5 text-2xl font-extrabold">
            Ronda {Math.min(s.round + 1, s.totalRounds)} de {s.totalRounds}
          </span>
          {s.endsAt && <Countdown deadline={s.endsAt} total={0} size={56} />}
        </div>
        {main}
      </div>
      {side && (
        <aside className="flex flex-col gap-4 self-center">
          <h2 className="toon text-3xl" style={{ '--stroke': '6px', '--drop': '3px' } as React.CSSProperties}>
            Ranking
          </h2>
          <Standings state={s} limit={8} />
          {s.teamStandings && (
            <>
              <h2 className="toon mt-2 text-2xl" style={{ '--stroke': '5px', '--drop': '3px' } as React.CSSProperties}>
                Equipos
              </h2>
              <Standings state={{ ...s, standings: s.teamStandings }} />
            </>
          )}
        </aside>
      )}
      {s.phase === 'paused' && (
        <div className="fixed inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-ink/70">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot/cabeza.png" alt="" width={220} height={220} />
          <Toon size="xxl">Pausa</Toon>
        </div>
      )}
      <ReactionLayer big />
    </main>
  );
}

/** The shared big screen: join instructions in the lobby, then the game for everyone to watch. */
export function TvScreen({ code }: { code: string }) {
  const connection = useRoomConnection(code, { asSpectator: true });
  const lobby = useRoom((s) => s.lobby);
  const game = useRoom((s) => s.game);
  // The podium stays up for a while, then the screen goes back to inviting people in.
  const finishedAt = game?.state.finished?.at ?? null;
  const [podiumFresh, setPodiumFresh] = useState(true);
  useEffect(() => {
    if (finishedAt === null) return setPodiumFresh(true);
    const left = finishedAt + PODIUM_MS - serverNow();
    setPodiumFresh(left > 0);
    if (left <= 0) return;
    const id = setTimeout(() => setPodiumFresh(false), left);
    return () => clearTimeout(id);
  }, [finishedAt]);

  let screen: React.ReactNode;
  if (connection.status === 'gone') screen = <StatusScreen title="Sala cerrada" detail="Esta sala ya no existe." />;
  else if (connection.status === 'error') screen = <StatusScreen title="Algo falló" detail="No pudimos conectar la pantalla. Recargá la página." />;
  else if (!lobby) screen = <StatusScreen title="Conectando la pantalla…" action={false} />;
  else if (game && (game.state.phase !== 'finished' || podiumFresh)) screen = <TvGame command={connection.command} />;
  else screen = <TvLobby code={code} />;
  return <Sky>{screen}</Sky>;
}
