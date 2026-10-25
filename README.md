# Megadados

Real-time multiplayer trivia for the Megafy team building: everyone plays from their own phone,
a TV shows the wheel and the ranking. See [docs/plan.md](docs/plan.md) for the full plan.

**Status:** stage 4 of 9 — rooms, lobby, reconnection and the full individual game (2D wheel,
questions, reveal, round results, podium) on phones and on the TV.

## Layout

```
src/game/          Pure game engine: config, commands, state machine, rules, public view
src/questions/     Question bank validation (shared with the admin import)
src/server/        Server functions: Database port, Postgres adapter, repository, game and room services
src/app/           Next.js routes: home, /s/CODE (phone), /s/CODE/tv (big screen), /api/*
src/features/      Screens by feature: home, lobby, game, tv, settings
src/realtime/      Browser side of the room: Zustand store, Supabase channels, server clock
src/ui/            Shared pieces: outlined type, die avatars, category icons, QR
src/scene3d/       Megafy mascot built in Three.js
supabase/          Migrations, seed data (seed/questions.json) and the generated seed.sql
tests/             Vitest: engine, database (PGlite) and server service
```

## Run the tests

```bash
npm install
```

```bash
npm test
```

The database tests run the real migrations on [PGlite](https://pglite.dev) (Postgres compiled to
WebAssembly) with a small stand-in for Supabase's `auth` and `realtime` schemas, so they need no
Docker and no Supabase project.

```bash
npm run typecheck
```

## Play locally

Needs Docker and the [Supabase CLI](https://supabase.com/docs/guides/local-development).

```bash
supabase start
```

```bash
npm run dev:local
```

`dev:local` reads the local stack's URLs and keys from `supabase status`, so no `.env` file is
needed, and listens on every interface so phones on the same Wi-Fi can join.

1. Open `http://localhost:3000`, create a room (you are the host).
2. Open `/s/CODE/tv` on the big screen. The QR points at the address the TV page was opened
   with, so open it with the computer's LAN address (for example `http://192.168.0.10:3000/s/CODE/tv`),
   or set `NEXT_PUBLIC_SITE_URL`.
3. Join from phones with the QR or the code.

To play as several people from one browser, add `?perfil=<name>` to the first URL of each tab
(`/s/CODE?perfil=caro`): every profile gets its own anonymous session, kept for that tab.

## Supabase setup

1. Create a project (region São Paulo, `sa-east-1`, to sit next to Vercel's `gru1`).
2. Apply the migrations with the Supabase CLI:

   ```bash
   supabase link --project-ref <project-ref>
   ```

   ```bash
   supabase db push
   ```

3. Load the question bank. In the SQL editor run `supabase/seed.sql`, or:

   ```bash
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```

4. Dashboard settings:
   - **Authentication › Sign In / Providers:** turn on *Anonymous sign-ins*.
   - **Authentication › Rate limits:** anonymous sign-ins default to 30 per hour per IP. With up to
     12 players behind one office network that is enough; raise it if you test a lot from one place.
   - **Realtime › Settings:** turn off *Allow public access*, so only private channels (authorized
     by the RLS policies on `realtime.messages`) work.
5. Create `.env.local` with:

   ```
   # Server only. Supabase › Connect › Transaction pooler (port 6543).
   DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   # Browser.
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
   # Optional: the public address printed under the TV's QR (defaults to the page's own origin).
   NEXT_PUBLIC_SITE_URL=https://megadados.vercel.app
   ```

`20261025000002_cleanup_cron.sql` enables `pg_cron` and schedules an hourly cleanup of rooms idle
for 6 hours.

## Editing the question bank

Questions live in `supabase/seed/questions.json`. After editing it:

```bash
npm run seed:build
```

The script validates every question (four distinct options, a correct index from 0 to 3, a known
category) and rewrites `supabase/seed.sql`. Megafy and Quién es quién ship as placeholders marked
`[COMPLETAR]`; they stay off the wheel until their category is turned on and the placeholders are
replaced. The admin panel (stage 8) will edit the same data in the database.
