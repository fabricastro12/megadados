'use client';

import { useEffect } from 'react';
import { wheelAngle } from '@/features/game/Wheel';
import { serverNow } from '@/realtime/clock';
import { type RoomStore, useRoom } from '@/realtime/roomStore';
import { unlockOnFirstGesture } from './engine';
import { music } from './music';
import { sfx } from './sfx';

/**
 * Plays the game's sounds from state changes. Phones get personal feedback (their own result,
 * their own countdown); the TV gets the music and the room-wide stings.
 */
export function useGameSounds(screen: 'phone' | 'tv') {
  useEffect(() => {
    const release = unlockOnFirstGesture();
    let frame = 0;
    let lastBeep = -1;

    const tickWhileSpinning = () => {
      const game = useRoom.getState().game?.state;
      const spin = game?.spin;
      if (!game || !spin || game.phase !== 'spinning') return;
      const segments = game.categories.length + 1;
      let peg = Math.floor(wheelAngle(spin, segments, serverNow()) / (360 / segments));
      const loop = () => {
        const now = serverNow();
        const current = Math.floor(wheelAngle(spin, segments, now) / (360 / segments));
        if (current !== peg) sfx.tick();
        peg = current;
        if (now < spin.startedAt + spin.durationMs && useRoom.getState().game?.state.phase === 'spinning') frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    };

    const onChange = (next: RoomStore, prev: RoomStore) => {
      const a = prev.game?.state;
      const b = next.game?.state;
      if (screen === 'tv') {
        if (next.reactions.length > prev.reactions.length) sfx.pop();
        if ((next.lobby?.players.length ?? 0) > (prev.lobby?.players.length ?? 0)) sfx.pop();
        music.start(b && b.phase !== 'finished' ? 'game' : 'calm');
      }
      if (!b || b === a) return;
      const phaseChanged = a?.phase !== b.phase || prev.game?.game !== next.game?.game;
      if (!phaseChanged) return;
      if (b.phase === 'spinning') {
        sfx.spin();
        tickWhileSpinning();
      }
      if (b.phase === 'question' && a?.phase !== 'paused') sfx.pop();
      if (b.phase === 'reveal' && b.reveal) {
        const mine = next.you?.ownerId ? b.reveal.results[next.you.ownerId] : undefined;
        if (screen === 'tv') sfx.reveal();
        else if (mine && !mine.passed) (mine.correct ? sfx.correct : sfx.wrong)();
        const crown = screen === 'tv' ? Object.values(b.reveal.results).some((r) => r.crownAwarded) : !!mine?.crownAwarded;
        if (crown) setTimeout(sfx.crown, 600);
      }
      if (b.phase === 'finished') sfx.fanfare();
    };
    const unsubscribe = useRoom.subscribe(onChange);

    // Countdown beeps in the last five seconds.
    const beeper = setInterval(() => {
      const { game, you } = useRoom.getState();
      const s = game?.state;
      if (!s || s.phase !== 'question' || !s.question) return;
      if (screen === 'phone') {
        const owner = you?.ownerId;
        if (!owner || !s.question.eligible.includes(owner) || s.question.answeredBy.includes(owner) || you?.myChoice != null) return;
      }
      const deadline = screen === 'phone' ? (you?.myDeadline ?? s.question.deadline) : s.phaseDeadline;
      if (!deadline) return;
      const left = Math.ceil((deadline - serverNow()) / 1000);
      if (left >= 1 && left <= 5 && left !== lastBeep) sfx.beep(left === 1);
      lastBeep = left;
    }, 100);

    if (screen === 'tv') music.start(useRoom.getState().game ? 'game' : 'calm');
    return () => {
      release();
      unsubscribe();
      clearInterval(beeper);
      cancelAnimationFrame(frame);
      if (screen === 'tv') music.stop();
    };
  }, [screen]);
}
