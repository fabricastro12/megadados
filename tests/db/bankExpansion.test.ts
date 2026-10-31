import { describe, expect, it } from 'vitest';
import { freshDatabase, migration } from './harness';

describe('expanding the six-category bank', () => {
  it('adds the new content without overwriting edits, custom questions or running matches', async () => {
    const db = await freshDatabase();
    // Load the original 108-question snapshot to simulate an already deployed installation.
    const original = migration('20261030000001_six_categories_and_images.sql');
    const bankStart = original.indexOf('insert into public.categories (slug');
    const bankEnd = original.indexOf('-- All future matches');
    await db.exec(original.slice(bankStart, bankEnd));
    expect((await db.query<{ count: number }>('select count(*)::int as count from public.questions')).rows[0]!.count).toBe(108);

    const originalQuestion = (await db.query<{ id: string; category_id: string }>(`select id, category_id from public.questions where kind = 'text' order by id limit 1`)).rows[0]!;
    await db.query(`update public.questions set prompt = 'Pregunta revisada por administración', is_active = false where id = $1`, [originalQuestion.id]);
    await db.query(`insert into public.questions (category_id, prompt, options, correct_index) values ($1, 'Pregunta propia del equipo', array['A','B','C','D'], 0)`, [originalQuestion.category_id]);
    await db.query(`update public.categories set color = '#123456' where id = $1`, [originalQuestion.category_id]);
    const room = (await db.query<{ id: string }>(`insert into public.rooms (code, status, config) values ('MXQ7K', 'playing', '{}') returning id`)).rows[0]!;
    await db.query(`insert into public.games (room_id, phase, state) values ($1, 'question', '{"phase":"question","round":2}')`, [room.id]);

    const expansion = migration('20261030000002_expand_question_bank.sql');
    await db.exec(expansion);
    await db.exec(expansion); // An operator can safely rerun it.
    expect((await db.query<{ count: number }>('select count(*)::int as count from public.questions')).rows[0]!.count).toBe(301);
    expect((await db.query<{ prompt: string; is_active: boolean }>('select prompt, is_active from public.questions where id = $1', [originalQuestion.id])).rows[0]).toEqual({ prompt: 'Pregunta revisada por administración', is_active: false });
    expect((await db.query<{ color: string }>('select color from public.categories where id = $1', [originalQuestion.category_id])).rows[0]!.color).toBe('#123456');
    expect((await db.query<{ status: string }>('select status from public.rooms where id = $1', [room.id])).rows[0]!.status).toBe('playing');
    expect((await db.query<{ phase: string; state: unknown }>('select phase, state from public.games')).rows[0]).toEqual({ phase: 'question', state: { phase: 'question', round: 2 } });
    const counts = (await db.query<{ kind: string; count: number }>('select kind, count(*)::int as count from public.questions group by kind order by kind')).rows;
    expect(counts).toEqual([{ kind: 'image', count: 60 }, { kind: 'text', count: 241 }]);
  });
});
