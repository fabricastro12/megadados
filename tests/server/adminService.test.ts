import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { QuestionBankSchema } from '@/questions/schema';
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

const question = (categoryId: string, prompt = '¿Cuál es la capital de Chile?') => ({
  categoryId,
  prompt,
  options: ['Santiago', 'Valparaíso', 'Concepción', 'Antofagasta'],
  correct: 0,
  difficulty: 'easy' as const,
  explanation: null,
  image: null,
  isActive: true,
});

describe('admin access', () => {
  it('turns away anyone not listed as admin', async () => {
    expect(await adminBank(db, U.player)).toMatchObject({ ok: false, error: 'not_admin', status: 403 });
    expect(await adminAction(db, U.player, { type: 'deleteQuestion', id: '00000000-0000-4000-8000-000000000001' })).toMatchObject({ ok: false, error: 'not_admin' });
  });

  it('sees every category and question, inactive and placeholders included', async () => {
    const b = await bank();
    expect(b.categories.length).toBe(6);
    expect(b.questions.some((q) => q.isPlaceholder)).toBe(true);
    expect(b.categories.reduce((n, c) => n + c.questionCount, 0)).toBe(b.questions.length);
  });
});

describe('editing the bank', () => {
  it('adds, edits and deletes a question', async () => {
    const before = await bank();
    const latam = before.categories.find((c) => c.slug === 'latinoamerica')!;
    const added = await adminAction(db, ADMIN, { type: 'saveQuestion', question: question(latam.id) });
    if (!added.ok) throw new Error(added.error);
    const created = added.value.bank.questions.find((q) => q.prompt === '¿Cuál es la capital de Chile?')!;
    expect(added.value.bank.questions.length).toBe(before.questions.length + 1);

    const edited = await adminAction(db, ADMIN, { type: 'saveQuestion', question: { ...question(latam.id), id: created.id, correct: 1, isActive: false } });
    expect(edited.ok && edited.value.bank.questions.find((q) => q.id === created.id)).toMatchObject({ correct: 1, isActive: false });

    const deleted = await adminAction(db, ADMIN, { type: 'deleteQuestion', id: created.id });
    expect(deleted.ok && deleted.value.bank.questions.length).toBe(before.questions.length);
  });

  it('writing over a placeholder makes it a real question', async () => {
    const placeholder = (await bank()).questions.find((q) => q.isPlaceholder)!;
    const result = await adminAction(db, ADMIN, { type: 'saveQuestion', question: { ...question(placeholder.categoryId, '¿En qué año se fundó Megafy?'), id: placeholder.id } });
    expect(result.ok && result.value.bank.questions.find((q) => q.id === placeholder.id)).toMatchObject({ isPlaceholder: false, isActive: true });
  });

  it('refuses a duplicate slug and deleting a category that has questions', async () => {
    const b = await bank();
    const [first, second] = b.categories;
    expect(await adminAction(db, ADMIN, { type: 'saveCategory', category: { ...first!, slug: second!.slug } })).toMatchObject({ ok: false, error: 'slug_taken' });
    expect(await adminAction(db, ADMIN, { type: 'deleteCategory', id: first!.id })).toMatchObject({ ok: false, error: 'category_not_empty' });
    const created = await adminAction(db, ADMIN, { type: 'saveCategory', category: { slug: 'deportes', name: 'Deportes', color: '#2CC56F', icon: 'dice', sortOrder: 9, isActive: false } });
    if (!created.ok) throw new Error(created.error);
    const empty = created.value.bank.categories.find((c) => c.slug === 'deportes')!;
    const deleted = await adminAction(db, ADMIN, { type: 'deleteCategory', id: empty.id });
    expect(deleted.ok && deleted.value.bank.categories.some((c) => c.slug === 'deportes')).toBe(false);
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
    const q = { category: 'cultura-general', prompt: '¿Cuántos lados tiene un hexágono?', options: ['6', '5', '8', '7'], correct: 0, difficulty: 'easy' as const, placeholder: false };
    const result = await adminAction(db, ADMIN, { type: 'import', categories: [], questions: [q, { ...q, prompt: q.prompt.toUpperCase() }, { ...q, prompt: 'Una pregunta por escribir', placeholder: true }] });
    expect(result.ok && result.value.imported).toEqual({ added: 2, skipped: 1 });
    const stored = (await pg.query<{ is_active: boolean }>(`select is_active from public.questions where prompt = 'Una pregunta por escribir'`)).rows[0];
    expect(stored?.is_active).toBe(false);
  });

  it('rejects questions for a category that does not exist', async () => {
    const q = { category: 'inexistente', prompt: 'Pregunta suelta', options: ['a', 'b', 'c', 'd'], correct: 0, difficulty: 'easy' as const, placeholder: false };
    expect(await adminAction(db, ADMIN, { type: 'import', categories: [], questions: [q] })).toMatchObject({ ok: false, error: 'unknown_category' });
  });
});
