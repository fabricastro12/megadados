'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ApiResult } from './api';

let client: SupabaseClient | null = null;

/**
 * The admin panel's own client and session (email and password), stored apart from the
 * anonymous player session so signing in here never takes over a seat in a game.
 */
export function adminSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'megadados-admin' } });
  }
  return client;
}

export async function adminApi<T>(body?: unknown): Promise<ApiResult<T>> {
  const { data } = await adminSupabase().auth.getSession();
  if (!data.session) return { ok: false, status: 401, error: 'unauthenticated' };
  try {
    const response = await fetch('/api/admin/bank', {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${data.session.access_token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, status: response.status, error: json.error ?? 'unknown' };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, status: 0, error: 'offline' };
  }
}

export const ADMIN_ERRORS: Record<string, string> = {
  not_admin: 'Esta cuenta no tiene permiso de administración. Pedí que la agreguen a la tabla admins.',
  unauthenticated: 'Tu sesión venció. Volvé a entrar.',
  slug_taken: 'Ya hay una categoría con ese identificador.',
  category_not_empty: 'La categoría tiene preguntas. Borralas o movelas antes de eliminarla.',
  unknown_category: 'Hay preguntas de categorías que no existen. Agregalas primero o incluilas en el archivo.',
  not_found: 'Eso ya no existe. Recargá la página.',
  invalid_command: 'Algún dato no es válido. Revisá el formulario.',
  offline: 'Sin conexión con el servidor.',
};
