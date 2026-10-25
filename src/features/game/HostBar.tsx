'use client';

import { useState } from 'react';
import type { ApiResult } from '@/lib/api';
import { useRoom } from '@/realtime/roomStore';

/** Pause, skip and end, for the host only. Ending asks twice. */
export function HostBar({ command }: { command: (body: Record<string, unknown>) => Promise<ApiResult<unknown>> }) {
  const phase = useRoom((s) => s.game?.state.phase);
  const [confirmEnd, setConfirmEnd] = useState(false);
  if (!phase || phase === 'finished') return null;
  const paused = phase === 'paused';
  return (
    <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Controles del host">
      <button type="button" className="btn !min-h-10 text-sm" onClick={() => void command({ type: paused ? 'resume' : 'pause' })}>
        {paused ? 'Seguir' : 'Pausar'}
      </button>
      {!paused && (
        <button type="button" className="btn !min-h-10 text-sm" onClick={() => void command({ type: 'skip' })}>
          Saltar
        </button>
      )}
      {confirmEnd ? (
        <>
          <button type="button" className="btn btn-danger !min-h-10 text-sm" onClick={() => void command({ type: 'end' }).then(() => setConfirmEnd(false))}>
            Sí, terminar
          </button>
          <button type="button" className="btn !min-h-10 text-sm" onClick={() => setConfirmEnd(false)}>
            No
          </button>
        </>
      ) : (
        <button type="button" className="btn !min-h-10 text-sm" onClick={() => setConfirmEnd(true)}>
          Terminar partida
        </button>
      )}
    </div>
  );
}
