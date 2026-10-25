import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { serverDatabase } from './db/postgresDatabase';
import type { ServiceDeps, ServiceResult } from './games/gameService';

let verifier: SupabaseClient | null = null;

function supabaseVerifier(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set');
  verifier ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return verifier;
}

/** The Supabase user behind `Authorization: Bearer <access token>`, verified with getClaims(). */
export async function authenticatedUser(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseVerifier().auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

export function deps(): ServiceDeps {
  return { db: serverDatabase() };
}

export function respond<T>(result: ServiceResult<T>): NextResponse {
  if (result.ok) return NextResponse.json(result.value);
  return NextResponse.json({ error: result.error }, { status: result.status });
}

export function error(status: number, code: string): NextResponse {
  return NextResponse.json({ error: code }, { status });
}

/** Parses the JSON body with a schema; returns a 400 response when it does not match. */
export async function body<T>(request: Request, schema: ZodType<T>): Promise<{ ok: true; value: T } | { ok: false; response: NextResponse }> {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { ok: false, response: error(400, 'invalid_command') };
  return { ok: true, value: parsed.data };
}

/** Wraps a handler that needs a signed-in session. */
export function withUser<C>(handler: (request: Request, userId: string, context: C) => Promise<NextResponse>) {
  return async (request: Request, context: C) => {
    const userId = await authenticatedUser(request);
    if (!userId) return error(401, 'unauthenticated');
    return handler(request, userId, context);
  };
}

export const normalizeCode = (code: string) => code.trim().toUpperCase();
