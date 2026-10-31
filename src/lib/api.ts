'use client';

import type { Session } from '@supabase/supabase-js';
import { ensureSession } from './supabase';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** Never throws: a failed sign-in or a dropped connection comes back as an error result. */
export async function api<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<ApiResult<T>> {
  let session: Session;
  try {
    session = await ensureSession();
  } catch {
    // Anonymous sign-in refused (switched off in Supabase Auth) or unreachable.
    return { ok: false, status: 401, error: 'no_session' };
  }
  try {
    const response = await fetch(path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, status: response.status, error: json.error ?? 'unknown' };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, status: 0, error: 'offline' };
  }
}

/** Messages for the errors a player can actually run into. */
export const ERROR_COPY: Record<string, string> = {
  no_room: 'No encontramos esa sala. Revisá el código.',
  room_closed: 'Esta partida no acepta gente nueva. Pedile al host que te deje entrar.',
  not_in_room: 'Ya no estás en esta sala.',
  wrong_pin: 'Ese PIN no es el del host.',
  host_present: 'El host sigue conectado. Para tomar el control necesitás su PIN.',
  not_enough_players: 'Hace falta al menos un jugador (o dos equipos con gente) para empezar.',
  already_playing: 'La partida ya empezó.',
  late: 'Se terminó el tiempo para responder.',
  offline: 'Sin conexión. Reintentamos solos cuando vuelva.',
  no_session: 'No pudimos iniciar tu sesión. Recargá la página y probá de nuevo.',
  no_questions: 'No hay preguntas para este modo, dificultad y categorías. Cambiá la configuración o agregá preguntas en administración.',
  invalid_category: 'Alguna categoría ya no está disponible.',
};
