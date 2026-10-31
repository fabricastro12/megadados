import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { AdminActionSchema, QuestionBankSchema } from '@/questions/schema';
import type { Database } from '@/server/db/database';
import { toQuestionBank } from '@/questions/adminBank';
import { adminAction, adminBank } from '@/server/admin/adminService';
import { U, freshDatabase } from '../db/harness';
import { pgliteDatabase } from './pgliteDatabase';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ADMIN = U.host;

let pg: PGlite;
let db: Database;

beforeEach(async () => {
  pg = await freshDatabase();
  await pg.exec(readFileSync(`${root}supabase/seed.sql`, 'utf8'));
  await pg.query(`insert into auth.users (id) values ($1) on conflict do nothing`, [ADMIN]);
  await pg.query(`insert into public.admins (user_id) values ($1)`, [ADMIN]);
  db = pgliteDatabase(pg);
});

async function bank() {
  const result = await adminBank(db, ADMIN);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const question = (categoryId: string, prompt = '¿Cuál es la capital de Croacia?') => ({
  categoryId,
  prompt,
  options: ['Zagreb', 'Split', 'Dubrovnik', 'Rijeka'],
  correct: 0,
  difficulty: 'easy' as const,
  explanation: null,
  image: null,
  kind: 'text' as const,
  imageCredit: null,
  imageSource: null,
  isActive: true,
});

describe('admin access', () => {
  it('turns away anyone not listed as admin', async () => {
    expect(await adminBank(db, U.player)).toMatchObject({ ok: false, error: 'not_admin', status: 403 });
    expect(await adminAction(db, U.player, { type: 'deleteQuestion', id: '00000000-0000-4000-8000-000000000001' })).toMatchObject({ ok: false, error: 'not_admin' });
  });

  it('sees the fixed catalogue and both question types', async () => {
    const b = await bank();
    expect(b.categories.length).toBe(6);
    expect(b.questions.some((q) => q.kind === 'image')).toBe(true);
    expect(b.questions.some((q) => q.isPlaceholder)).toBe(false);
    expect(b.categories.reduce((n, c) => n + c.questionCount, 0)).toBe(b.questions.length);
  });
});

describe('editing the bank', () => {
  it('adds, edits and deletes a question', async () => {
    const before = await bank();
    const geography = before.categories.find((c) => c.slug === 'geografia')!;
    const added = await adminAction(db, ADMIN, { type: 'saveQuestion', question: question(geography.id) });
    if (!added.ok) throw new Error(added.error);
    const created = added.value.bank.questions.find((q) => q.prompt === '¿Cuál es la capital de Croacia?')!;
    expect(added.value.bank.questions.length).toBe(before.questions.length + 1);

    const edited = await adminAction(db, ADMIN, { type: 'saveQuestion', question: { ...question(geography.id), id: created.id, correct: 1, isActive: false } });
    expect(edited.ok && edited.value.bank.questions.find((q) => q.id === created.id)).toMatchObject({ correct: 1, isActive: false });

    const deleted = await adminAction(db, ADMIN, { type: 'deleteQuestion', id: created.id });
    expect(deleted.ok && deleted.value.bank.questions.length).toBe(before.questions.length);
  });

});

describe('import and export', () => {
  it('exports in the seed format and importing it back adds nothing', async () => {
    const exported = toQuestionBank(await bank());
    expect(QuestionBankSchema.safeParse(exported).success).toBe(true);
    const result = await adminAction(db, ADMIN, { type: 'import', ...exported });
    expect(result.ok && result.value.imported).toEqual({ added: 0, skipped: exported.questions.length });
  });

  it('imports new questions, skips repeated ones and keeps placeholders off', async () => {
    const q = { category: 'arte-literatura' as const, kind: 'text' as const, prompt: '¿Cuántos lados tiene un hexágono?', options: ['6', '5', '8', '7'], correct: 0, difficulty: 'easy' as const, placeholder: false };
    const result = await adminAction(db, ADMIN, { type: 'import', categories: [], questions: [q, { ...q, prompt: q.prompt.toUpperCase() }, { ...q, prompt: 'Una pregunta por escribir', placeholder: true }] });
    expect(result.ok && result.value.imported).toEqual({ added: 2, skipped: 1 });
    const stored = (await pg.query<{ is_active: boolean }>(`select is_active from public.questions where prompt = 'Una pregunta por escribir'`)).rows[0];
    expect(stored?.is_active).toBe(false);
  });

  it('rejects questions for a category that does not exist', async () => {
    const q = { category: 'inexistente', prompt: 'Pregunta suelta', options: ['a', 'b', 'c', 'd'], correct: 0, difficulty: 'easy' as const, placeholder: false };
    expect(AdminActionSchema.safeParse({ type: 'import', categories: [], questions: [q] }).success).toBe(false);
  });
});
