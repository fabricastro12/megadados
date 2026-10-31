'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { CROWN_LOOK, useCatalog, useOwnerName } from '@/features/game/catalog';
import { Countdown } from '@/features/game/Countdown';
import { Podium } from '@/features/game/Podium';
import { type OptionState, QuestionView } from '@/features/game/QuestionView';
import { ReactionLayer } from '@/features/game/Reactions';
import { Standings } from '@/features/game/Standings';
import { useAutoTick } from '@/features/game/useAutoTick';
import { WheelView } from '@/features/game/WheelView';
import { rulesSummary } from '@/features/lobby/rulesSummary';
import { StatusScreen } from '@/features/room/RoomScreen';
import { isUnlocked, unlock } from '@/audio/engine';
import { useGameSounds } from '@/audio/useGameSounds';
import type { PublicGameState } from '@/game';
import type { MascotPoseName } from '@/scene3d/mascot';
import { mascotPose } from './mascotPose';
import { useThreeD } from '@/scene3d/useThreeD';
import { serverNow } from '@/realtime/clock';
import { useRoomConnection } from '@/realtime/useRoomConnection';
import { useRoom } from '@/realtime/roomStore';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { DieAvatar } from '@/ui/DieAvatar';
import { Qr } from '@/ui/Qr';
import { Sky } from '@/ui/Sky';
import { Toon } from '@/ui/Toon';

const PODIUM_MS = 90_000;

const MascotStage = dynamic(() => import('@/scene3d/MascotStage'), { ssr: false });

/** The 3D mascot in the TV's corner, or its picture in light mode. */
function TvMascot({ pose }: { pose: MascotPoseName }) {
  const threeD = useThreeD();
  const picture = pose === 'festejo' || pose === 'guino' ? 'festejo' : pose === 'sorpresa' ? 'sorpresa' : pose === 'carta' || pose === 'pensando' ? 'carta' : 'saludo';
  return (
    // Always mounted in the same corner: rebuilding the mascot between phases would stall the TV.
    <div className="pointer-events-none fixed bottom-0 right-10 z-10 flex w-[max(380px,28vw)] justify-center" style={{ height: 'min(340px, 32vh)' }}>
      {threeD ? (
        <MascotStage pose={pose} className="h-full" style={{ width: 'min(300px, 28vh)' }} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/mascot/${picture}.png`} alt="" className="h-full w-full object-contain object-bottom" />
      )}
    </div>
  );
}

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
  const viewport = useViewportHeight();
  const players = lobby.players.filter((p) => p.role !== 'spectator');
  // Dice shrink as the room fills up, so twelve still fit on one screen.
  const die = Math.round(Math.min(160, viewport * (players.length > 8 ? 0.1 : 0.13)));
  return (
    <main className="grid min-h-dvh grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 p-12">
      <section className="flex flex-col items-center justify-center gap-6 text-center">
        <Toon size="xl" as="h1">
          ¡Sumate!
        </Toon>
        {url && <Qr value={url} size={Math.round(Math.min(420, viewport * 0.36))} />}
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
                <DieAvatar avatar={p.avatar} size={die} dim={!online.has(p.id)} />
                <span className="max-w-full truncate text-2xl font-extrabold">{p.name}</span>
              </li>
            ))}
          </ul>
          {players.length === 0 && <p className="text-2xl font-bold text-ink-soft">Todavía no entró nadie. ¡Sacá el celu!</p>}
        </div>
        <div className="flex items-center gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot/saludo.png" alt="" width={Math.round(viewport * 0.22)} height={Math.round(viewport * 0.22)} className="object-contain" />
          <p className="sticker flex-1 p-5 text-2xl font-bold">{rulesSummary(lobby.room.config)}</p>
        </div>
      </section>
    </main>
  );
}

function turnCopy(s: PublicGameState, nameOf: (id: string | null | undefined) => string): string {
  const q = s.question!;
  if (s.mode !== 'clasico') return `Respondieron ${q.answeredBy.length} de ${q.eligible.length}`;
  const owner = q.eligible[0];
  if (s.answerMode === 'vote') {
    const members = s.teams.find((t) => t.id === owner)?.memberIds.filter((id) => s.players.some((p) => p.id === id && p.active)) ?? [];
    return `Vota ${nameOf(owner)}: ${members.filter((id) => q.votedBy.includes(id)).length} de ${members.length}`;
  }
  if (s.answerMode === 'captain') return `Responde ${nameOf(s.captainId)} por ${nameOf(owner)}`;
  if (s.answerMode === 'first') return `Responde ${nameOf(owner)}: el primero que toque`;
  return `Responde ${nameOf(owner)}`;
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
        <Podium state={s} big scale={Math.min(2.4, Math.max(1.4, viewport / 560))} />
        {/* Above the mascot's corner. */}
        <div className="self-start pb-[34vh] pt-[6vh]">
          <Standings state={s} limit={8} big={viewport >= 900} />
        </div>
      </div>
    );
  } else if (phase === 'awaitingSpin' || phase === 'spinning') {
    main = (
      <div className="flex flex-col items-center gap-6">
        <Toon size="xl" as="h1">
          {phase === 'spinning' ? '¡Gira, gira!' : `Gira ${nameOf(s.spinnerId)}`}
        </Toon>
        <WheelView segments={segments} spin={s.spin} size={Math.min(600, Math.round(viewport * 0.62))} pausedAt={s.pausedAt} effects />
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
              <div
                key={id}
                className="flex min-w-48 flex-col items-center gap-2 rounded-3xl border-4 border-ink p-5 text-white shadow-[0_6px_0_#1C2A66]"
                style={{ background: c.color }}
              >
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
              <p className="text-2xl font-extrabold">{turnCopy(s, nameOf)}</p>
              {s.mode !== 'clasico' && <AnsweredStrip ids={q.answeredBy} />}
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
    <main className={`grid min-h-dvh gap-10 p-10 ${side ? 'grid-cols-[minmax(0,1fr)_minmax(380px,28vw)]' : ''}`}>
      <div className="flex flex-col justify-center">
        <div className="mb-6 flex items-center gap-4">
          <span className="rounded-full border-4 border-ink bg-white px-5 py-1.5 text-2xl font-extrabold">
            Ronda {s.round + 1}{!s.endsAt && ` de ${s.totalRounds}`}
          </span>
          {s.endsAt && <Countdown deadline={s.endsAt} total={0} size={56} />}
        </div>
        {main}
      </div>
      {side && (
        // The bottom of the column is left to the mascot.
        <aside className="flex flex-col gap-4 self-start pb-[34vh] pt-4">
          <h2 className="toon text-3xl" style={{ '--stroke': '6px', '--drop': '3px' } as React.CSSProperties}>
            Ranking
          </h2>
          <Standings state={s} limit={s.teamStandings && s.mode !== 'clasico' ? 5 : 8} big={viewport >= 900} />
          {s.teamStandings && s.mode !== 'clasico' && (
            <>
              <h2 className="toon mt-2 text-2xl" style={{ '--stroke': '5px', '--drop': '3px' } as React.CSSProperties}>
                Equipos
              </h2>
              <Standings state={{ ...s, standings: s.teamStandings }} big={viewport >= 900} />
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
      <TvMascot pose={mascotPose(s)} />
      <ReactionLayer big />
    </main>
  );
}

/** Browsers start the TV muted until someone touches it; this is that touch. */
function SoundGate() {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    setLocked(!isUnlocked());
    const id = setInterval(() => setLocked(!isUnlocked()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!locked) return null;
  return (
    <button type="button" className="btn btn-gold fixed left-6 top-6 z-40" onClick={() => void unlock().then((ok) => setLocked(!ok))}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9z" />
        <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
      </svg>
      Activar sonido
    </button>
  );
}

/** The shared big screen: join instructions in the lobby, then the game for everyone to watch. */
export function TvScreen({ code }: { code: string }) {
  const connection = useRoomConnection(code, { asSpectator: true });
  useGameSounds('tv');
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
  return (
    <Sky>
      {screen}
      <SoundGate />
    </Sky>
  );
}
