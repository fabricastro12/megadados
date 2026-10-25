-- Megadados core schema.
-- The game server (Next.js route handlers with a direct Postgres connection) is the only writer
-- of game data. Browsers read through RLS-scoped policies and receive state over Realtime.

-- ---------------------------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------------------------

create type public.difficulty as enum ('easy', 'medium', 'hard');
create type public.room_status as enum ('lobby', 'playing', 'finished');
create type public.player_role as enum ('host', 'player', 'spectator');
create type public.vote_kind as enum ('team', 'audience');
create type public.lifeline_kind as enum ('fiftyFifty', 'pass', 'extraTime', 'audience');

-- ---------------------------------------------------------------------------------------------
-- Question bank
-- ---------------------------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 40),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text not null default 'dice',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  prompt text not null check (char_length(prompt) between 5 and 300),
  options text[] not null check (cardinality(options) = 4),
  correct_index smallint not null check (correct_index between 0 and 3),
  difficulty public.difficulty not null default 'medium',
  explanation text check (explanation is null or char_length(explanation) <= 500),
  image_url text,
  is_active boolean not null default true,
  -- Seed rows the team still has to write (Megafy, Quién es quién). Never served while true.
  is_placeholder boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint placeholders_are_inactive check (not (is_placeholder and is_active))
);

create index questions_playable_idx on public.questions (category_id, difficulty) where is_active;

create table public.presets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 60),
  config jsonb not null,
  created_at timestamptz not null default now()
);

-- Permanent (non-anonymous) accounts allowed into /admin.
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Rooms and players
-- ---------------------------------------------------------------------------------------------

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  -- No 0/O, 1/I: codes are read off a TV and typed on phones.
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{5}$'),
  status public.room_status not null default 'lobby',
  config jsonb not null,
  host_player_id uuid,
  host_pin_hash text,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours'
);

create index rooms_expires_idx on public.rooms (expires_at);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  color text not null default '#2E8BFF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  unique (room_id, name)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  -- auth.uid() of the (anonymous) Supabase session that owns this seat.
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 24),
  avatar jsonb not null default '{"color": "violet", "face": "happy"}',
  role public.player_role not null default 'player',
  team_id uuid references public.teams (id) on delete set null,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  kicked_at timestamptz,
  unique (room_id, user_id)
);

create index players_user_idx on public.players (user_id);

alter table public.rooms
  add constraint rooms_host_player_fk foreign key (host_player_id)
  references public.players (id) on delete set null deferrable initially deferred;

-- ---------------------------------------------------------------------------------------------
-- Games
-- ---------------------------------------------------------------------------------------------

create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  -- 1 for the first game in a room, +1 per rematch.
  seq integer not null default 1,
  phase text not null,
  -- The engine's full state, decks and answer keys included. Server-only: no client policy.
  state jsonb not null,
  version integer not null default 0,
  phase_deadline_at timestamptz,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (room_id, seq)
);

create table public.game_questions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  question_id uuid references public.questions (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  is_crown boolean not null default false,
  asked_at timestamptz not null default now(),
  -- A question is never asked twice in the same game.
  unique (game_id, question_id)
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  game_question_id uuid not null references public.game_questions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  choice smallint not null check (choice between 0 and 3),
  received_at timestamptz not null default now(),
  is_correct boolean,
  points integer,
  -- One answer per player per question, even if two requests land in the same millisecond.
  unique (game_question_id, player_id)
);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  game_question_id uuid not null references public.game_questions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  kind public.vote_kind not null,
  choice smallint not null check (choice between 0 and 3),
  received_at timestamptz not null default now(),
  unique (game_question_id, player_id, kind)
);

create table public.lifeline_uses (
  game_id uuid not null references public.games (id) on delete cascade,
  -- A player id, or a team id in classic team play.
  owner_id uuid not null,
  lifeline public.lifeline_kind not null,
  used_at timestamptz not null default now(),
  primary key (game_id, owner_id, lifeline)
);

-- ---------------------------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger questions_touch_updated_at before update on public.questions
  for each row execute function public.touch_updated_at();

-- Any game activity keeps its room alive for another 6 hours.
create function public.touch_room_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.rooms
     set last_activity_at = now(), expires_at = now() + interval '6 hours'
   where id = new.room_id;
  return new;
end;
$$;

create trigger games_touch_room after insert or update on public.games
  for each row execute function public.touch_room_activity();

create function public.cleanup_expired_rooms() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  removed integer;
begin
  delete from public.rooms where expires_at < now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- Five characters from an alphabet without look-alikes; retried until unused.
create function public.generate_room_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
      into candidate
      from generate_series(1, 5);
    exit when not exists (select 1 from public.rooms where code = candidate);
  end loop;
  return candidate;
end;
$$;

revoke execute on function public.cleanup_expired_rooms() from public, anon, authenticated;
revoke execute on function public.generate_room_code() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Authorization helpers (security definer so policies can read players without recursion)
-- ---------------------------------------------------------------------------------------------

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
     and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false;
$$;

create function public.my_role_in(room uuid) returns public.player_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.players p
   where p.room_id = room and p.user_id = (select auth.uid()) and p.kicked_at is null
   limit 1;
$$;

create function public.is_room_member(room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.my_role_in(room) is not null;
$$;

-- Realtime topics: "room:<CODE>" for the whole room, "room:<CODE>:screens" for the TV and host.
create function public.room_for_topic(topic text) returns uuid
language sql stable security definer set search_path = '' as $$
  select r.id from public.rooms r
   where split_part(topic, ':', 1) = 'room' and r.code = split_part(topic, ':', 2);
$$;

create function public.can_receive_topic(topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when topic ~ '^room:[A-Z0-9]{5}$' then public.is_room_member(public.room_for_topic(topic))
    when topic ~ '^room:[A-Z0-9]{5}:screens$' then public.my_role_in(public.room_for_topic(topic)) in ('host', 'spectator')
    else false
  end;
$$;

-- Clients may only track Presence on the room topic and send reactions to the screens topic;
-- game state is broadcast by the server from inside its transactions.
create function public.can_send_topic(topic text, extension text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when topic ~ '^room:[A-Z0-9]{5}$' then extension = 'presence' and public.is_room_member(public.room_for_topic(topic))
    when topic ~ '^room:[A-Z0-9]{5}:screens$' then extension = 'broadcast' and public.is_room_member(public.room_for_topic(topic))
    else false
  end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------

alter table public.categories enable row level security;
alter table public.questions enable row level security;
alter table public.presets enable row level security;
alter table public.admins enable row level security;
alter table public.rooms enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.game_questions enable row level security;
alter table public.answers enable row level security;
alter table public.votes enable row level security;
alter table public.lifeline_uses enable row level security;

-- Categories: anyone sees the active ones (lobby, wheel); admins see and manage all.
create policy "categories readable" on public.categories for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy "categories managed by admins" on public.categories for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Questions hold the answer key: only admins may read them. Players get questions from the server.
create policy "questions managed by admins" on public.questions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "presets readable" on public.presets for select to authenticated using (true);
create policy "presets managed by admins" on public.presets for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins see themselves" on public.admins for select to authenticated
  using (user_id = (select auth.uid()));

create policy "rooms visible to members" on public.rooms for select to authenticated
  using ((select public.is_room_member(id)));
create policy "teams visible to members" on public.teams for select to authenticated
  using ((select public.is_room_member(room_id)));
create policy "players visible to members" on public.players for select to authenticated
  using ((select public.is_room_member(room_id)));

-- games, game_questions and lifeline_uses: no client policies at all (server only).

create policy "own answers" on public.answers for select to authenticated
  using (exists (select 1 from public.players p where p.id = player_id and p.user_id = (select auth.uid())));
create policy "own votes" on public.votes for select to authenticated
  using (exists (select 1 from public.players p where p.id = player_id and p.user_id = (select auth.uid())));

-- Realtime authorization for private channels (RLS is already enabled on realtime.messages).
create policy "room members receive" on realtime.messages for select to authenticated
  using (realtime.messages.extension in ('broadcast', 'presence') and (select public.can_receive_topic((select realtime.topic()))));
create policy "room members send presence and reactions" on realtime.messages for insert to authenticated
  with check ((select public.can_send_topic((select realtime.topic()), realtime.messages.extension)));
