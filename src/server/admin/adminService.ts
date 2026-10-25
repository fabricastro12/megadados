import type { AdminBank } from '@/questions/adminBank';
import type { AdminAction, CategoryEdit, CategoryInput, QuestionEdit, QuestionInput } from '@/questions/schema';
import type { Database, SqlExecutor } from '../db/database';
import { type ServiceResult, fail } from '../games/gameService';

/** Permanent accounts listed in `admins`; anonymous sessions never qualify (checked by the caller). */
export async function isAdmin(db: SqlExecutor, userId: string): Promise<boolean> {
  return (await db.query(`select 1 from public.admins where user_id = $1`, [userId])).length > 0;
}

export async function loadBank(db: SqlExecutor): Promise<AdminBank> {
  const categories = await db.query<{ id: string; slug: string; name: string; color: string; icon: string; sort_order: number; is_active: boolean; count: number }>(
    `select c.id, c.slug, c.name, c.color, c.icon, c.sort_order, c.is_active, count(q.id)::int as count
       from public.categories c left join public.questions q on q.category_id = c.id
      group by c.id order by c.sort_order, c.name`,
  );
  const questions = await db.query<{
    id: string;
    category_id: string;
    prompt: string;
    options: string[];
    correct_index: number;
    difficulty: QuestionEdit['difficulty'];
    explanation: string | null;
    image_url: string | null;
    is_active: boolean;
    is_placeholder: boolean;
  }>(
    `select id, category_id, prompt, options, correct_index, difficulty, explanation, image_url, is_active, is_placeholder
       from public.questions order by created_at, id`,
  );
  return {
    categories: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      color: c.color,
      icon: c.icon,
      sortOrder: c.sort_order,
      isActive: c.is_active,
      questionCount: c.count,
    })),
    questions: questions.map((q) => ({
      id: q.id,
      categoryId: q.category_id,
      prompt: q.prompt,
      options: q.options,
      correct: q.correct_index,
      difficulty: q.difficulty,
      explanation: q.explanation,
      image: q.image_url,
      isActive: q.is_active,
      isPlaceholder: q.is_placeholder,
    })),
  };
}

async function saveCategory(tx: SqlExecutor, c: CategoryEdit): Promise<ServiceResult<null>> {
  const clash = await tx.query(`select 1 from public.categories where slug = $1 and id is distinct from $2`, [c.slug, c.id ?? null]);
  if (clash.length > 0) return fail('slug_taken');
  if (c.id) {
    const rows = await tx.query(
      `update public.categories set slug = $2, name = $3, color = $4, icon = $5, sort_order = $6, is_active = $7 where id = $1 returning id`,
      [c.id, c.slug, c.name, c.color, c.icon, c.sortOrder, c.isActive],
    );
    if (rows.length === 0) return fail('not_found');
  } else {
    await tx.query(`insert into public.categories (slug, name, color, icon, sort_order, is_active) values ($1, $2, $3, $4, $5, $6)`, [
      c.slug,
      c.name,
      c.color,
      c.icon,
      c.sortOrder,
      c.isActive,
    ]);
  }
  return { ok: true, value: null };
}

async function saveQuestion(tx: SqlExecutor, q: QuestionEdit): Promise<ServiceResult<null>> {
  const category = await tx.query(`select 1 from public.categories where id = $1`, [q.categoryId]);
  if (category.length === 0) return fail('not_found');
  const values = [q.categoryId, q.prompt, q.options, q.correct, q.difficulty, q.explanation || null, q.image || null, q.isActive];
  if (q.id) {
    // Editing a placeholder means someone wrote the real question: it stops being a placeholder.
    const rows = await tx.query(
      `update public.questions set category_id = $2, prompt = $3, options = $4, correct_index = $5, difficulty = $6::public.difficulty,
              explanation = $7, image_url = $8, is_active = $9, is_placeholder = false, updated_at = now()
        where id = $1 returning id`,
      [q.id, ...values],
    );
    if (rows.length === 0) return fail('not_found');
  } else {
    await tx.query(
      `insert into public.questions (category_id, prompt, options, correct_index, difficulty, explanation, image_url, is_active)
       values ($1, $2, $3, $4, $5::public.difficulty, $6, $7, $8)`,
      values,
    );
  }
  return { ok: true, value: null };
}

/** Adds what is new: categories update by slug, questions already in the bank (same text) are skipped. */
async function importBank(
  tx: SqlExecutor,
  input: { categories: CategoryInput[]; questions: QuestionInput[] },
): Promise<ServiceResult<{ added: number; skipped: number }>> {
  for (const c of input.categories) {
    await tx.query(
      `insert into public.categories (slug, name, color, icon, sort_order, is_active) values ($1, $2, $3, $4, $5, $6)
       on conflict (slug) do update set name = excluded.name, color = excluded.color, icon = excluded.icon,
         sort_order = excluded.sort_order, is_active = excluded.is_active`,
      [c.slug, c.name, c.color, c.icon, c.sortOrder, c.isActive],
    );
  }
  const categories = new Map((await tx.query<{ id: string; slug: string }>(`select id, slug from public.categories`)).map((c) => [c.slug, c.id]));
  const unknown = [...new Set(input.questions.map((q) => q.category).filter((slug) => !categories.has(slug)))];
  if (unknown.length > 0) return fail('unknown_category');
  const existing = new Set(
    (await tx.query<{ category_id: string; prompt: string }>(`select category_id, prompt from public.questions`)).map((q) => `${q.category_id}|${q.prompt.trim().toLowerCase()}`),
  );
  let added = 0;
  let skipped = 0;
  for (const q of input.questions) {
    const categoryId = categories.get(q.category)!;
    const key = `${categoryId}|${q.prompt.trim().toLowerCase()}`;
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }
    existing.add(key);
    await tx.query(
      `insert into public.questions (category_id, prompt, options, correct_index, difficulty, explanation, image_url, is_active, is_placeholder)
       values ($1, $2, $3, $4, $5::public.difficulty, $6, $7, $8, $9)`,
      [categoryId, q.prompt, q.options, q.correct, q.difficulty, q.explanation ?? null, q.image ?? null, !q.placeholder, q.placeholder],
    );
    added += 1;
  }
  return { ok: true, value: { added, skipped } };
}

/** Runs one admin change and returns the whole bank as it is afterwards. */
export async function adminAction(
  db: Database,
  userId: string,
  action: AdminAction,
): Promise<ServiceResult<{ bank: AdminBank; imported?: { added: number; skipped: number } }>> {
  return db.transaction(async (tx) => {
    if (!(await isAdmin(tx, userId))) return fail('not_admin');
    let imported: { added: number; skipped: number } | undefined;
    switch (action.type) {
      case 'saveCategory': {
        const result = await saveCategory(tx, action.category);
        if (!result.ok) return result;
        break;
      }
      case 'deleteCategory': {
        // Deleting a category would take its questions with it; only empty ones go.
        const used = await tx.query(`select 1 from public.questions where category_id = $1 limit 1`, [action.id]);
        if (used.length > 0) return fail('category_not_empty');
        await tx.query(`delete from public.categories where id = $1`, [action.id]);
        break;
      }
      case 'saveQuestion': {
        const result = await saveQuestion(tx, action.question);
        if (!result.ok) return result;
        break;
      }
      case 'deleteQuestion':
        await tx.query(`delete from public.questions where id = $1`, [action.id]);
        break;
      case 'import': {
        const result = await importBank(tx, action);
        if (!result.ok) return result;
        imported = result.value;
        break;
      }
    }
    return { ok: true, value: { bank: await loadBank(tx), imported } };
  });
}

export async function adminBank(db: Database, userId: string): Promise<ServiceResult<AdminBank>> {
  return db.transaction(async (tx) => {
    if (!(await isAdmin(tx, userId))) return fail('not_admin');
    return { ok: true, value: await loadBank(tx) };
  });
}
