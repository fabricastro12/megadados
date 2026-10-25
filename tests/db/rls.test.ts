import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { U, asUser, freshDatabase, seedRoom } from './harness';

let db: PGlite;
let ids: Awaited<ReturnType<typeof seedRoom>>;

beforeEach(async () => {
  db = await freshDatabase();
  ids = await seedRoom(db);
});

const count = async (tx: { query: PGlite['query'] }, sql: string) => (await tx.query(sql)).rows.length;

describe('room data', () => {
  it('members see their room, its players and teams', async () => {
    await asUser(db, { sub: U.player, is_anonymous: true }, async (tx) => {
      expect(await count(tx, 'select * from public.rooms')).toBe(1);
      expect(await count(tx, 'select * from public.players')).toBe(3);
    });
  });

  it('people outside the room see nothing', async () => {
    await asUser(db, { sub: U.stranger, is_anonymous: true }, async (tx) => {
      expect(await count(tx, 'select * from public.rooms')).toBe(0);
      expect(await count(tx, 'select * from public.players')).toBe(0);
    });
    await asUser(db, null, async (tx) => {
      expect(await count(tx, 'select * from public.rooms')).toBe(0);
    });
  });

  it('a kicked player loses access', async () => {
    await db.query('update public.players set kicked_at = now() where id = $1', [ids.playerId]);
    await asUser(db, { sub: U.player, is_anonymous: true }, async (tx) => {
      expect(await count(tx, 'select * from public.rooms')).toBe(0);
    });
  });

  it('browsers cannot write game data directly', async () => {
    await asUser(db, { sub: U.host, is_anonymous: true }, async (tx) => {
      const updated = await tx.query(`update public.rooms set status = 'finished' returning id`);
      expect(updated.rows).toHaveLength(0);
      await expect(
        tx.query(`insert into public.players (room_id, user_id, name) values ($1, $2, 'Colado')`, [ids.roomId, U.stranger]),
      ).rejects.toThrow(/row-level security/);
    });
  });
});

describe('secrets', () => {
  it('nobody but an admin can read questions, so the answer key stays on the server', async () => {
    await asUser(db, { sub: U.player, is_anonymous: true }, async (tx) => {
      expect(await count(tx, 'select correct_index from public.questions')).toBe(0);
    });
    await db.query('insert into auth.users (id) values ($1)', [U.admin]);
    await db.query('insert into public.admins (user_id) values ($1)', [U.admin]);
    await asUser(db, { sub: U.admin, is_anonymous: false }, async (tx) => {
      expect(await count(tx, 'select correct_index from public.questions')).toBe(1);
    });
    // The same id signed in anonymously is not an admin.
    await asUser(db, { sub: U.admin, is_anonymous: true }, async (tx) => {
      expect(await count(tx, 'select * from public.questions')).toBe(0);
    });
  });

  it('game state, asked questions and lifelines are server only', async () => {
    await asUser(db, { sub: U.host, is_anonymous: true }, async (tx) => {
      expect(await count(tx, 'select * from public.games')).toBe(0);
      expect(await count(tx, 'select * from public.game_questions')).toBe(0);
      expect(await count(tx, 'select * from public.lifeline_uses')).toBe(0);
    });
  });

  it('players read only their own answers', async () => {
    await db.query(`insert into public.answers (game_question_id, player_id, choice) values ($1, $2, 1), ($1, $3, 2)`, [
      ids.gameQuestionId,
      ids.playerId,
      ids.hostId,
    ]);
    await asUser(db, { sub: U.player, is_anonymous: true }, async (tx) => {
      const rows = (await tx.query<{ choice: number }>('select choice from public.answers')).rows;
      expect(rows).toEqual([{ choice: 1 }]);
    });
  });

  it('only active categories are public', async () => {
    await db.query(`insert into public.categories (slug, name, color, is_active) values ('megafy', 'Megafy', '#9B5CFF', false)`);
    await asUser(db, null, async (tx) => {
      expect(await count(tx, 'select * from public.categories')).toBe(1);
    });
  });
});

describe('integrity', () => {
  it('one answer per player per question', async () => {
    const insert = () =>
      db.query(`insert into public.answers (game_question_id, player_id, choice) values ($1, $2, 1)`, [ids.gameQuestionId, ids.playerId]);
    await insert();
    await expect(insert()).rejects.toThrow(/duplicate key/);
  });

  it('a question is asked at most once per game', async () => {
    await expect(
      db.query(`insert into public.game_questions (game_id, question_id) values ($1, $2)`, [ids.gameId, ids.questionId]),
    ).rejects.toThrow(/duplicate key/);
  });

  it('rejects malformed questions', async () => {
    await expect(
      db.query(`insert into public.questions (category_id, prompt, options, correct_index) values ($1, 'Pregunta corta?', array['a','b','c'], 0)`, [
        ids.categoryId,
      ]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(
        `insert into public.questions (category_id, prompt, options, correct_index, is_placeholder, is_active)
         values ($1, 'Completar pregunta', array['a','b','c','d'], 0, true, true)`,
        [ids.categoryId],
      ),
    ).rejects.toThrow(/placeholders_are_inactive/);
  });

  it('room codes avoid look-alike characters and are unique', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const code = (await db.query<{ code: string }>('select public.generate_room_code() as code')).rows[0]!.code;
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
      codes.add(code);
    }
    expect(codes.size).toBeGreaterThan(45);
  });

  it('game activity extends the room; idle rooms are cleaned up with everything in them', async () => {
    await db.query(`update public.rooms set expires_at = now() - interval '1 minute'`);
    await db.query(`update public.games set version = version + 1`);
    const after = (await db.query<{ alive: boolean }>('select expires_at > now() as alive from public.rooms')).rows[0]!;
    expect(after.alive).toBe(true);

    await db.query(`update public.rooms set expires_at = now() - interval '1 minute'`);
    const removed = (await db.query<{ n: number }>('select public.cleanup_expired_rooms() as n')).rows[0]!.n;
    expect(removed).toBe(1);
    expect((await db.query('select * from public.players')).rows).toHaveLength(0);
    expect((await db.query('select * from public.game_questions')).rows).toHaveLength(0);
  });
});

describe('realtime channels', () => {
  const canReceive = (sub: string, topic: string) =>
    asUser(db, { sub, is_anonymous: true }, async (tx) => (await tx.query('select 1 from realtime.messages')).rows.length > 0, { topic });

  const trySend = (sub: string, topic: string, extension: string) =>
    asUser(
      db,
      { sub, is_anonymous: true },
      async (tx) => {
        await tx.query(`insert into realtime.messages (topic, extension, event) values ($1, $2, 'x')`, [topic, extension]);
        return true;
      },
      { topic },
    ).catch(() => false);

  beforeEach(async () => {
    await db.query(`select realtime.send('{}', 'state', 'room:MXQ7K', true)`);
    await db.query(`select realtime.send('{}', 'answered', 'room:MXQ7K:screens', true)`);
  });

  it('room members receive the room topic; strangers do not', async () => {
    expect(await canReceive(U.player, 'room:MXQ7K')).toBe(true);
    expect(await canReceive(U.stranger, 'room:MXQ7K')).toBe(false);
  });

  it('only the host and the TV receive the screens topic', async () => {
    expect(await canReceive(U.host, 'room:MXQ7K:screens')).toBe(true);
    expect(await canReceive(U.spectator, 'room:MXQ7K:screens')).toBe(true);
    expect(await canReceive(U.player, 'room:MXQ7K:screens')).toBe(false);
  });

  it('players track presence and send reactions, but cannot fake game broadcasts', async () => {
    expect(await trySend(U.player, 'room:MXQ7K', 'presence')).toBe(true);
    expect(await trySend(U.player, 'room:MXQ7K', 'broadcast')).toBe(false);
    expect(await trySend(U.player, 'room:MXQ7K:screens', 'broadcast')).toBe(true);
    expect(await trySend(U.stranger, 'room:MXQ7K', 'presence')).toBe(false);
  });
});
