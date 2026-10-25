import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { QuestionBankSchema } from '@/questions/schema';
import { freshDatabase } from './harness';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bank = QuestionBankSchema.parse(JSON.parse(readFileSync(`${root}supabase/seed/questions.json`, 'utf8')));

describe('seed question bank', () => {
  it('has at least 15 questions per category', () => {
    for (const c of bank.categories) {
      expect(bank.questions.filter((q) => q.category === c.slug).length, c.slug).toBeGreaterThanOrEqual(15);
    }
  });

  it('keeps Megafy and Quién es quién as clearly marked placeholders, off the wheel until written', () => {
    for (const slug of ['megafy', 'quien-es-quien']) {
      const questions = bank.questions.filter((q) => q.category === slug);
      expect(questions.every((q) => q.placeholder && q.prompt.startsWith('[COMPLETAR]'))).toBe(true);
      expect(bank.categories.find((c) => c.slug === slug)!.isActive).toBe(false);
    }
  });

  it('spreads the correct option across A–D and never repeats a prompt', () => {
    const real = bank.questions.filter((q) => !q.placeholder);
    const positions = [0, 1, 2, 3].map((i) => real.filter((q) => q.correct === i).length);
    for (const n of positions) expect(n).toBeGreaterThanOrEqual(real.length / 6);
    expect(new Set(bank.questions.map((q) => q.prompt)).size).toBe(bank.questions.length);
  });

  it('seed.sql loads on the migrated schema and matches the JSON', async () => {
    const db = await freshDatabase();
    await db.exec(readFileSync(`${root}supabase/seed.sql`, 'utf8'));
    const counts = (
      await db.query<{ active: number; placeholders: number }>(
        `select count(*) filter (where is_active)::int as active, count(*) filter (where is_placeholder)::int as placeholders from public.questions`,
      )
    ).rows[0]!;
    expect(counts.active).toBe(bank.questions.filter((q) => !q.placeholder).length);
    expect(counts.placeholders).toBe(bank.questions.filter((q) => q.placeholder).length);
  });
});
