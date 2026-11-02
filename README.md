# Megadados

Real-time multiplayer trivia for the Megafy team building: everyone plays from their own phone,
a TV shows the wheel and the ranking. See [docs/plan.md](docs/plan.md) for the full plan.

Two modes: simultaneous **Ronda** (Todos a la vez) and turn-based **Clásico** (Por turnos).
Both mix text and image questions in each category's shuffled deck.
There are exactly six supported categories: **Arte y literatura, Deportes, Historia, Geografía,
Ciencia and Entretenimiento**. The seed contains 240 text questions and 60 image questions (40 text and 10 visual per category).
Lifelines are 50/50, pass and (in classic mode) audience voting. Extra time and player expulsion
are no longer supported. Time-limited games finish the current question when time expires and
ignore the round cap; they can still end if the bank runs out of questions or the host ends them.

The lobby offers ready-made configurations. The closing screen on phones and TV includes the
MVP, longest streak, fastest correct answer and best category, when those statistics exist.

## Layout

```
src/game/          Pure game engine: config, commands, state machine, rules, public view
src/questions/     Question bank validation (shared with the admin import)
src/server/        Server functions: Database port, Postgres adapter, repository, game and room services
src/app/           Next.js routes: home, /s/CODE (phone), /s/CODE/tv (big screen), /api/*
src/features/      Screens by feature: home, lobby, game, tv, admin, settings
src/audio/         Synthesized sound effects and the TV music (Web Audio, no files)
src/realtime/      Browser side of the room: Zustand store, Supabase channels, server clock
src/ui/            Shared pieces: outlined type, die avatars, category icons, QR
src/scene3d/       Three.js: the Megafy mascot and the 3D wheel (React Three Fiber)
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

`tests/server/multiClient.test.ts` plays whole games with twelve phones and a TV sending their
answers and ticks at the same instant, and checks that every phase advances once, versions only
grow, no state leaks the answer before the reveal, and the board matches the recorded answers.

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

On a phone, the wheel and the TV mascot fall back to 2D in **Ajustes › Modo liviano** (it turns on
by itself on weak devices). On a laptop, players can answer with the keys 1–4 or A–D.

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

## Admin panel

`/admin` edits questions within the six fixed categories, and imports or exports them as JSON (the seed format) or
CSV (one row per question, the correct option as a letter). It needs a permanent Supabase account
(email and password, never an anonymous one) listed in `public.admins`.

Create one on the local stack (the address and password below are only an example):

```bash
npm run admin:local -- admin@megadados.test megadados-local-admin
```

In production, run `scripts/create-admin.ts` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
and `DATABASE_URL` set, or create the user in the dashboard (Authentication › Users) and add its
id to `public.admins`.

## Editing the question bank

Questions live in `supabase/seed/questions.json`. After editing it:

```bash
npm run seed:build
```

The script validates four distinct options, the correct index, a supported category, and image
metadata. The generated SQL uses stable IDs so rerunning it does not duplicate questions.
Category names and slugs are fixed; the admin panel cannot add or delete categories.

Open `docs/revision-preguntas.html` in a browser to review the 300-question snapshot, including
photos, correct answers and filters. Review marks and notes stay in the browser and can be
exported as CSV. This document does not update the live bank and must be refreshed after bank edits.

## Image questions and image bank

Both **Todos a la vez** and **Por turnos** draw text and image questions from the same bank,
filtered by the chosen categories and difficulty. Questions marked `kind: "image"` ask players
to identify what is shown in the photo. The format is selected by shuffling the questions, so
either can appear next. If no playable questions match, starting the match returns a clear error.
Questions are never repeated inside a match.

Existing rooms saved with `mode: "imagenes"` are read as **Todos a la vez**, so this change needs
no database migration. Matches already in progress keep their existing decks; new matches and
rematches mix both formats.

In `/admin`, choose **Identificar una imagen**, search Wikimedia Commons, select and visually
verify the photo, write the prompt and four options, and mark the correct answer. Save to add it
to the visual bank. The integration uses the public Commons API and requires no API key. Image
search is available only to admins, cached for 24 hours, and limited to JPEG/PNG/WebP images with
public-domain or Creative Commons attribution licenses. The provider can be temporarily unavailable;
the form shows a retry message. The starter bank includes singers, athletes, paintings, scientists,
monuments and an ancient wonder. More images can be added through the same workflow.

Photo filenames and source credits can reveal the answer. Players therefore fetch the current
photo through a room-authorized endpoint and receive an opaque blob URL. Credits and the source
page appear at reveal, on phones and TV. The photo endpoint only fetches the Commons upload and
thumbnail hosts, blocks redirects and unexpected content types, and limits images to 8 MiB.
If a photo fails to load, the screen offers **Volver a cargar**.

JSON/CSV exports preserve `kind`, `image`, `imageCredit` / `image_credit` and `imageSource` /
`image_source`, so a visual question can be exported and imported without losing its attribution.

## Updating an existing database

Apply `supabase/migrations/20261030000001_six_categories_and_images.sql` with `supabase db push`
(or your usual migration runner) before deploying this version. It replaces the old categories and
their questions, removes the retired lifeline and expulsion column, installs the new bank, and
updates room settings. Running games are closed with the reason **Banco actualizado**, retaining
recorded results; the room can start a rematch. Finished games keep their recorded scores. Reload
open clients after the upgrade. The migration includes the starter bank; running `seed.sql` again
is optional and idempotent.

The automated tests run migrations and game services against PGlite. They do not substitute for
a live Supabase/WebSocket check on actual phones and a TV.

### Expanding an existing six-category installation

`20261030000002_expand_question_bank.sql` adds 192 questions (150 text and 42 visual), bringing
the starter bank to 300. Apply it after the six-category migration. It only inserts missing
stable IDs: it preserves admin edits, custom questions, category settings and games in progress.
The expanded bank is used by newly started matches. Every category has both formats at all three
difficulties; each visual question uses a distinct Commons file with plain-text attribution.
