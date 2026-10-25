import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';

const root = fileURLToPath(new URL('../../', import.meta.url));

/**
 * The slice of Supabase the migrations rely on: the anon/authenticated roles, auth.uid()/auth.jwt()
 * reading the request claims, and realtime.messages with topic()/send().
 */
const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create schema realtime;
create table realtime.messages (
  id bigserial primary key,
  topic text not null,
  extension text not null,
  event text,
  payload jsonb,
  private boolean default true,
  inserted_at timestamptz default now()
);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language sql as $$
  insert into realtime.messages (topic, extension, event, payload, private) values (topic, 'broadcast', event, payload, private)
$$;

grant usage on schema auth, realtime to anon, authenticated;
grant select, insert on realtime.messages to anon, authenticated;
grant usage on sequence realtime.messages_id_seq to anon, authenticated;
`;

/** Supabase grants table privileges to these roles by default and lets RLS decide. */
const DEFAULT_GRANTS = `
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
`;

export function migration(name: string): string {
  return readFileSync(`${root}supabase/migrations/${name}`, 'utf8');
}

export async function freshDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(migration('20261025000001_init.sql'));
  await db.exec(migration('20261025000003_reactions_topic.sql'));
  await db.exec(DEFAULT_GRANTS);
  return db;
}

export interface Claims {
  sub: string;
  is_anonymous?: boolean;
}

/** Runs `fn` as a signed-in browser would: role `authenticated`, RLS on, with these JWT claims. */
export async function asUser<T>(
  db: PGlite,
  claims: Claims | null,
  fn: (tx: Transaction) => Promise<T>,
  opts: { topic?: string } = {},
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims ?? {})]);
    if (opts.topic) await tx.query(`select set_config('realtime.topic', $1, true)`, [opts.topic]);
    await tx.query(claims ? 'set local role authenticated' : 'set local role anon');
    return fn(tx);
  });
}

export const U = {
  host: '00000000-0000-4000-8000-000000000001',
  player: '00000000-0000-4000-8000-000000000002',
  spectator: '00000000-0000-4000-8000-000000000003',
  stranger: '00000000-0000-4000-8000-000000000004',
  admin: '00000000-0000-4000-8000-000000000005',
} as const;

/** A room MXQ7K with a host, a player and a TV, plus one question and a game in progress. */
export async function seedRoom(db: PGlite) {
  const room = await db.query<{ id: string }>(
    `insert into public.rooms (code, config) values ('MXQ7K', '{}') returning id`,
  );
  const roomId = room.rows[0]!.id;
  const players = await db.query<{ id: string; user_id: string }>(
    `insert into public.players (room_id, user_id, name, role) values
       ($1, $2, 'Nico', 'host'), ($1, $3, 'Caro', 'player'), ($1, $4, 'Pantalla', 'spectator')
     returning id, user_id`,
    [roomId, U.host, U.player, U.spectator],
  );
  const byUser = Object.fromEntries(players.rows.map((p) => [p.user_id, p.id]));
  const category = await db.query<{ id: string }>(
    `insert into public.categories (slug, name, color) values ('latam', 'Latinoamérica', '#FF6A3D') returning id`,
  );
  const question = await db.query<{ id: string }>(
    `insert into public.questions (category_id, prompt, options, correct_index)
     values ($1, '¿Qué lago comparten Perú y Bolivia?', array['Poopó','Titicaca','Maracaibo','General Carrera'], 1)
     returning id`,
    [category.rows[0]!.id],
  );
  const game = await db.query<{ id: string }>(
    `insert into public.games (room_id, phase, state) values ($1, 'question', '{"secret": 1}') returning id`,
    [roomId],
  );
  const gq = await db.query<{ id: string }>(
    `insert into public.game_questions (game_id, question_id, category_id) values ($1, $2, $3) returning id`,
    [game.rows[0]!.id, question.rows[0]!.id, category.rows[0]!.id],
  );
  return {
    roomId,
    hostId: byUser[U.host]!,
    playerId: byUser[U.player]!,
    spectatorId: byUser[U.spectator]!,
    categoryId: category.rows[0]!.id,
    questionId: question.rows[0]!.id,
    gameId: game.rows[0]!.id,
    gameQuestionId: gq.rows[0]!.id,
  };
}
