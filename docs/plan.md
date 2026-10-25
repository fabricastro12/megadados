# Megadados — Stage 1 plan

Online, real-time multiplayer trivia for the Megafy team building. Every person plays from their own
device and joins a room with a code. UI copy is Rioplatense Spanish; code, docs and tests are English.

Status: **proposal, waiting for approval.** Nothing is implemented yet.

---

## 1. Visual direction: "Recreo" (cartoon game show)

Revised after review: the look follows the **Preguntados / Trivia Crack family** — bright, cartoon,
playful — instead of the first neon proposal. The *style* is shared; every asset is ours. No Etermax
logo, characters, icons or artwork are used or traced.

- **Sky world**: sky-blue gradient with soft white clouds as the ground of every screen.
- **Sticker UI**: white panels and buttons with a thick navy outline and a hard drop shadow
  (`0 6px 0 ink`), so everything looks tappable and pressable.
- **Chunky type**: white display lettering with a navy stroke and drop, used for the logo, titles,
  category names and big moments.
- **Mascot (Megafy's own character)**: a white capsule-shaped vinyl toy with a navy cap (red brim,
  "M" logo, snapback), a teal side patch, a red sash, the "Megafy" wordmark on the belly and navy
  sneakers, as defined in `docs/Hoja de poses del mascot Megafy.png`. It is built procedurally in
  Three.js (`src/scene3d/mascot/`, no model file): two-bone IK arms, swappable hands, five
  expressions and seven poses (idle, saludo, festejo, guiño, sorpresa, pensando, con carta), plus
  idle bob and blinking. It hosts the game: it reacts on the TV next to the wheel (thinking during
  the question, cheering or surprised at the reveal, holding the card on the podium).
- **Player avatars**: every player is a small die, skribbl-style: pick a color and a face
  (happy, wink, sunglasses, surprised, tongue out…) with arrow buttons in the lobby.
- **Brand colors from the mascot sheet**: navy `#23254A`, red `#EE3E38`, teal `#18A89E`. They
  replace the placeholder Megafy category color and anchor the UI tokens.

### Tokens (draft, to live in `src/theme/tokens.ts`)

| Token | Hex | Use |
| --- | --- | --- |
| `skyTop` / `skyBottom` | `#3FB2EE` / `#9EDCF8` | Background gradient |
| `ink` | `#1C2A66` | Outlines, text strokes, dark text (≈13:1 on white) |
| `inkSoft` | `#4A5A96` | Secondary text on white (≈6.6:1) |
| `panel` / `panelAlt` | `#FFFFFF` / `#EAF5FC` | Panels, answer buttons |
| `go` / `goShade` | `#2CC56F` / `#1C8A4C` | Primary action, correct (always with ✓ + text) |
| `wrong` / `wrongShade` | `#FF4D5A` / `#B8202E` | Wrong answer (always with ✕ + text) |
| `gold` | `#FFD23F` | Crowns, stars, podium |

Category colors (editable per category in admin; Megafy's brand color can replace `megafy`):

| Category | Hex (shade) | Original icon |
| --- | --- | --- |
| Megafy | `#9B5CFF` (`#6B33C9`) | two stacked dice |
| Tecnología & IA | `#2E8BFF` (`#1A5FC4`) | chip with a spark |
| Mendix/Low-code | `#2CC56F` (`#1C8A4C`) | three snapping blocks |
| Cultura General | `#FFB31A` (`#D07F00`) | open book |
| Latinoamérica | `#FF6A3D` (`#C9411A`) | sun over the Andes (the range all five countries share) |
| Quién es quién | `#FF5DAA` (`#C82F7A`) | two faces |

"Argentina & San Juan" is replaced by **Latinoamérica**: geography, history and culture of Peru,
Argentina, Chile, Bolivia and Venezuela in equal measure. The whole bank avoids country-specific
questions that only one nationality would know.

### Type

- **Lilita One** (display): logo, titles, category names, crown and podium. Always white with an
  `ink` stroke and hard drop.
- **Baloo 2** (UI and body, 500/700/800): rounded and friendly, readable at TV distance.
- Scale (mobile → TV ×1.75): 15 / 18 / 22 / 28 / 40 / 64.

### Layout principles

- **Player (mobile-first)**: status bar on top (team, points, crowns), content in the middle, the
  action zone in the bottom third. Answer buttons ≥ 68 px tall, full width, with an A–D chip (the
  letter is what the TV and the reveal reference).
- **TV (16:9)**: wheel dominates the left two thirds; scoreboard panel on the right.
- Motion answers events (spin, reveal, crown) with bouncy, cartoon easing. `prefers-reduced-motion`
  swaps spins and confetti for fades and a static result.

---

## 2. Real-time architecture

### Recommendation: Supabase, with the game logic in TypeScript running on Vercel

```
 Player / TV / Host (Next.js client)
   │  commands (HTTPS POST)            ▲ state + events (WebSocket)
   ▼                                   │
 Vercel Route Handler  /api/rooms/[code]/commands  (Node runtime, region gru1)
   │  1. verify Supabase JWT (anonymous user)      │
   │  2. BEGIN; SELECT game FOR UPDATE             │
   │  3. engine.apply(state, command, now, rng)    │  pure TS, shared with client types
   │  4. write state (version+1), answers, usage   │
   │  5. realtime.send(public state) in same tx    │
   │  6. COMMIT  ─────────────────────────────────►│ Supabase Realtime (private channel)
   ▼
 Supabase Postgres (sa-east-1)  — source of truth, RLS on every table
```

Why logic in TypeScript instead of PL/pgSQL RPCs:

- One **pure state machine** (`src/game/engine`) is the authority on the server and gives the client
  its types. Vitest tests run against the exact code that decides results.
- Concurrency is still handled by Postgres: one transaction per command, `SELECT … FOR UPDATE` on
  the game row, an optimistic `version` column, and unique constraints as the last line of defense.
- `realtime.send()` inside the transaction means the broadcast is only delivered if the commit
  succeeds — no event for a state that was rolled back.

Trade-off: an extra hop (client → Vercel → Postgres) versus calling an RPC directly. With Vercel in
São Paulo next to the database this is ~20–60 ms, well under what a trivia game notices.
Supabase Edge Functions would work the same way; Route Handlers keep everything in one repo and one
deploy. PartyKit/Liveblocks were considered: they make ephemeral sync easier but would split the
source of truth away from Postgres and add a vendor; not worth it here.

### Identity and reconnection

- On first visit the client calls `signInAnonymously()`; supabase-js persists the session (refresh
  token) in localStorage. `player_id` is stored next to it. RLS uses `auth.uid()`.
- Reload, network drop or tab change: client restores the session, calls `GET /snapshot` (sanitized
  public state + its own private view), re-joins the channel and re-tracks Presence. Same player row,
  same team, same points.
- Verified in the Supabase docs: anonymous sign-ins are rate limited to **30 per hour per IP** by
  default. At an office everyone shares one public IP; with 12 players this fits, and the README will
  note where to raise it (Auth › Rate limits) if needed.

### Channels and messages

| Topic | Who | What |
| --- | --- | --- |
| `room:{code}` (private) | everyone in the room | `state` (public state + version), `reaction_burst`, Presence |
| `room:{code}:screens` (private) | TV + host | per-player `answered` ticks, raw reactions |

- Clients apply `state` only if `version` is newer than what they hold; gaps trigger a snapshot fetch.
- Channel authorization is RLS on `realtime.messages` using `realtime.topic()` + room membership.
- The wheel is a state transition: the server picks the segment with a CSPRNG and stores
  `{segment, spinStartedAt, durationMs, extraTurns}`. Every client animates to the same segment
  against the server clock.
- **Clock sync**: on connect, 5 round trips to `/api/time`; offset taken from the lowest-RTT sample.
  All countdowns render `deadlineAt - (Date.now() + offset)`.

### Timers without a game server

There is no long-running process. Every phase stores `phaseDeadlineAt`. When any connected client's
local countdown passes the deadline (plus 300 ms grace) it sends `tick`; the server advances only if
`now() >= phaseDeadlineAt` and the version matches, so ten clients ticking at once advance exactly
once. If nobody is connected, nothing needs to advance. Answers received after the deadline are
rejected server-side using the server clock.

### Disconnections

- Presence drives the "connected / away" UI.
- The active player has a configurable spin window (default 15 s). If it expires: skip the turn, or
  in team mode let the team answer (config).
- Host: the host client heartbeats every 15 s (`last_seen_at`). If it is older than 45 s, any player
  can take control; alternatively anyone with the 4-digit **host PIN** (shown at creation) can claim
  it at any time. The game keeps running meanwhile because ticks come from every client.
- Inactive rooms expire after N hours (default 6) via a `pg_cron` job.

### Supabase free plan: limits and recommendation

Verified limits for the Free plan: **200 concurrent connections, 100 messages/s, 20 Presence
messages/s, 256 KB broadcast payload**. A "message" is every WebSocket message delivered to or sent
from a client, so one broadcast to 60 players costs 60.

Design choices to stay inside it:

- Per-answer "X respondió" ticks only go to the `screens` channel (2–3 clients), not to every phone.
- Reactions go to `screens`; the TV aggregates and re-broadcasts one `reaction_burst` every 1.5 s.
- One `state` broadcast per transition (≈ 6–10 per question).

**Expected audience: at most 12 players** (plus a TV and the host). That is ~15 connections and,
worst case, ~15 deliveries per broadcast, so the Free plan is more than enough and the anonymous
sign-in limit (30/hour/IP) is not a problem either. The throttling above stays as good hygiene.
Two notes: free projects are paused after a week of inactivity (wake it up before the event), and
Vercel's Hobby plan is for non-commercial use — a company event may need Pro or a team account.

---

## 3. Data model

All tables have RLS enabled. Writes to game tables happen only from the server (service role inside
the command handler); clients get read policies scoped to their room.

```
categories   id, slug, name, color, icon, is_active, sort_order
questions    id, category_id, prompt, options text[4], correct_index 0..3, difficulty
             (easy|medium|hard), explanation?, image_url?, is_active, is_placeholder, updated_at
presets      id, name, config jsonb, created_at
admins       user_id (non-anonymous auth users allowed into /admin)

rooms        id, code (5 chars, no ambiguous letters), host_player_id, host_pin_hash,
             config jsonb, status (lobby|playing|finished), last_activity_at, expires_at
players      id, room_id, user_id, name, avatar jsonb {color, face}, role (host|player|spectator), team_id?,
             kicked_at?, last_seen_at, joined_at          unique(room_id, user_id)
teams        id, room_id, name, color, sort_order

games        id, room_id, seq (rematch counter), state jsonb, version int, phase,
             phase_deadline_at, started_at, ended_at
game_questions id, game_id, question_id, category_id, asked_at, is_crown
             unique(game_id, question_id)                 -- no repeats within a game
answers      id, game_question_id, player_id, team_id?, choice, received_at, is_correct, points
             unique(game_question_id, player_id)          -- one answer per player per question
votes        id, game_question_id, player_id, kind (team|audience), choice, received_at
             unique(game_question_id, player_id, kind)
lifeline_uses game_id, owner_id (player or team), lifeline   unique(game_id, owner_id, lifeline)
```

RLS summary:

- `rooms`, `players`, `teams`, `games`: `select` if `auth.uid()` has a non-kicked player row in that
  room. No client `insert/update/delete`.
- `questions`: no client `select` at all (the correct index never leaves the server before reveal).
  Admins: full CRUD.
- `answers`, `votes`: `select` own rows only. Aggregates are delivered in `state` at reveal.
- `categories`: public `select` of active rows; admin CRUD. `presets`: hosts read, admins write.
- `realtime.messages`: join/send only for members of `room:{code}`; `:screens` only for host and
  spectator roles.

Server-side functions: `create_room`, `join_room`, `cleanup_expired_rooms` (pg_cron), plus the
command endpoint. Questions are served sanitized (`{id, prompt, options, difficulty}`).

---

## 4. Game state machine

Shared in `src/game/engine`, used by the server to decide and by the client for types and rendering.

```
(Ronda mode adds round_results after reveal: per-player +pts and new ranking, then the next spinner.)

lobby ──start──► spinning ──(wheel lands)──► question ──answer|timeout──► reveal
                    ▲   │                                                  │
                    │   └─(lands on crown | streak = crownStreak)─► crown_pick ──► question (crown)
                    │                                                      │
                    │                         crown won ◄──────────────────┤
                    │                              │                       │
                    └──── next spin / next turn ◄──┴───────────────────────┘
                                                   │
                                         win condition met ──► game_over ──rematch──► lobby
  paused: overlay on any phase (stores remaining time, resumes with a fresh deadline)
```

Commands: `start`, `spin`, `pickCrownCategory`, `answer`, `vote`, `useLifeline`, `audienceVote`,
`tick`, `pause`, `resume`, `end`, `skipTurn`, `adjustPoints`, `kick`, `assignTeam`, `claimHost`,
`rematch`. Each is validated with Zod, then by the engine against phase, actor role and turn.

Rules:

- **Default: individual "Ronda" mode (skribbl-like)**. Everyone plays for themselves and a live
  ranking is always on screen. Each round one player spins the wheel (the spinner rotates like
  skribbl's drawer, so everyone gets their moment), then **everyone answers the same question at
  once**. Points = base 100 + speed bonus up to 100, linear on remaining time, measured on server
  receive time. After each question a **round results** screen lists every player with their `+pts`
  and the new ranking. Default length: every player spins once (12 players → 12 questions, ~10 min).
- **Crowns in Ronda mode**: three correct answers in a row earn the crown of the category that
  completed the streak (if missing) plus a bonus. Crowns show as badges and break ties.
- **Optional teams**: the same Ronda flow, but players also have a team and the team score is the
  average of its members (fair with uneven teams). Teams can be turned on in the lobby.
- **Optional classic turn mode** (Preguntados-like): the active player/team spins and answers alone;
  correct → spin again, wrong → next turn. A streak of `crownStreak` (default 3) or the crown
  segment lets them pick a missing category for a crown question; a per-turn cap (default 5) keeps
  one person from holding the floor.
- **Team answering**: rotating captain; team vote (plurality, tie broken by the earliest first vote
  among tied options; resolves at deadline or when all connected members voted); or first to answer.
- **Win conditions**: all crowns (instant), most crowns after N rounds (points break ties), most
  points after N rounds, or time limit (finishes the current question).
- **Lifelines** (one of each per player or team): 50/50 (server returns two wrong indexes to hide),
  Pase (new question, same category, no penalty), +10 s (extends that owner's deadline), Consulta al
  público (8 s live vote by the other players, percentages shown; turn mode only).
- No repeated questions per game; if a category runs dry it falls back to another active one.
- Joining mid-game (if allowed) adds the player at the end of the turn order or to the smallest team.

---

## 5. Screens

| Route | Screen |
| --- | --- |
| `/` | Inicio: create room or join with code, animated 3D logo |
| `/s/[code]` | Join (QR target): name + avatar |
| `/s/[code]` (player) | Lobby (avatar editor) → game → reveal → crown → podium, one route driven by state |
| (TV) round results | Every player's +pts after each question and the updated ranking |
| `/s/[code]/tv` | Spectator/TV 16:9 view |
| `/s/[code]/host` | Host controls overlay (also available on the TV view) |
| `/admin` | Questions and categories CRUD, JSON/CSV import–export |
| Settings sheet | Audio volumes, light mode, font size (available everywhere) |

Designs for the key screens are on the Claude Design canvas linked in the stage 1 message.

---

## 6. Folder structure (screaming architecture)

```
src/
  app/                      Next.js routes only (thin)
    (play)/page.tsx, s/[code]/…, admin/…, api/rooms/[code]/{commands,snapshot}/route.ts, api/time
  game/                     domain: pure, no I/O, 100% unit tested
    engine/                 state machine, reducers per phase
    rules/                  scoring, streaks, crowns, lifelines, win conditions, turn order
    schemas/                Zod: commands, config, public state
    types.ts
  rooms/                    room lifecycle use cases: create, join, reconnect, host claim
  questions/                bank, selection without repeats, import/export, Zod validation
  server/                   adapters: postgres repo, transaction runner, realtime publisher, auth
  realtime/                 client: channel hook, presence, clock sync, snapshot recovery
  scene3d/                  r3f: Wheel, Background, Crown, Podium, Logo, quality detection
  audio/                    AudioManager (Howler) + Web Audio synth fallback
  ui/                       atoms / molecules / organisms (presentational)
  features/                 containers per screen (lobby, play, tv, reveal, podium, admin)
  theme/tokens.ts
supabase/
  migrations/, seed.sql, config.toml
tests/                      engine + rules (Vitest), multi-client scripts
public/sounds/CREDITS.md
```

---

## 6b. Stage 2 implementation notes

Decisions made while building the engine and the database, where they refine the plan above:

- **One state document per game.** `games.state` holds the whole engine state, decks and answer
  keys included, so the table has no client policy at all. Clients only ever see
  `toPublicState()` (broadcast and snapshot), which drops the decks, the correct option and other
  people's choices until the reveal. Tests check every broadcast payload for leaks.
- **Decks are built at game start** from the active questions of the wheel's categories (and the
  difficulty filter), shuffled with the server's CSPRNG. Drawing pops a card, so a question cannot
  repeat; an empty category falls back to one that still has cards, and an empty bank ends the game.
- **Question text travels in the broadcast envelope** (`{ version, state, question }`), read by id
  when the question is on screen; the explanation is sent only at the reveal.
- **Crown segment in ronda mode:** the spinner picks the category and that question scores double.
  In classic mode it opens a crown question for a missing category, as in Preguntados.
- **Concurrency:** every command runs in one transaction that locks the game row
  (`select … for update`), applies the engine, saves `version + 1`, writes the side tables and calls
  `realtime.send()` before committing. Racing ticks advance once; a double answer is refused by the
  engine and, as a last line, by `unique (game_question_id, player_id)`.
- **Answer grace:** 250 ms after the deadline on the server clock, to absorb network latency.
- **Not persisted yet:** team votes and audience votes live only in the game state (the `votes`
  table is ready for stage 5).

## 7. Stages

1. Plan, architecture, visual direction, screen designs ✓
2. DB schema, RLS, server functions, engine + Vitest tests ✓
3. Rooms, lobby, Presence and reconnection
4. Full individual turn-based flow, 2D UI
5. Teams, simultaneous, voting, lifelines
6. Synced 3D layer + postprocessing
7. Sound
8. Admin panel
9. Polish: motion, accessibility, multi-client tests, README

## 8. Open questions

1. Megafy logo as a vector file (the mascot sheet gives the colors; the "M" on the cap and card is
   redrawn by hand until then).
2. Admin access: Supabase email + password for 1–3 admins (proposed), or a single shared password?
3. Supabase region: São Paulo (`sa-east-1`) assumed.
4. UI copy: keep Rioplatense voseo ("Girá", "Te toca") or switch to neutral Spanish for a
   multinational team?
