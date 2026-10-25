'use client';

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * `?perfil=ana` gives this tab its own session, so one browser can play as several people
 * (handy for testing). The choice sticks to the tab through navigation and reloads.
 */
function storageKey(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('perfil');
    if (fromUrl) sessionStorage.setItem('megadados-perfil', fromUrl.replace(/[^a-z0-9-]/gi, '').slice(0, 24));
    const profile = sessionStorage.getItem('megadados-perfil');
    return profile ? `megadados-auth-${profile}` : 'megadados-auth';
  } catch {
    return 'megadados-auth';
  }
}

export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    // The session (with its refresh token) lives in localStorage: reloading or reopening the tab
    // brings back the same user, so the same seat, team and points.
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: storageKey() } });
  }
  return client;
}

let pending: Promise<Session> | null = null;

/** The current session, signing in anonymously the first time. */
export function ensureSession(): Promise<Session> {
  pending ??= (async () => {
    const { data } = await supabase().auth.getSession();
    if (data.session) return data.session;
    const signIn = await supabase().auth.signInAnonymously();
    if (signIn.error || !signIn.data.session) throw new Error(signIn.error?.message ?? 'No se pudo iniciar la sesión');
    return signIn.data.session;
  })().finally(() => {
    pending = null;
  });
  return pending;
}
