import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { QuestionBankSchema } from '@/questions/schema';
import { freshDatabase } from './harness';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bank = QuestionBankSchema.parse(JSON.parse(readFileSync(`${root}supabase/seed/questions.json`, 'utf8')));

describe('seed question bank', () => {
  it('has at least 40 text questions and 10 image questions per category', () => {
    for (const c of bank.categories) {
      const questions = bank.questions.filter((q) => q.category === c.slug);
      expect(questions.filter((q) => q.kind === 'text').length, c.slug).toBeGreaterThanOrEqual(40);
      expect(questions.filter((q) => q.kind === 'image').length, c.slug).toBeGreaterThanOrEqual(10);
    }
  });

  it('has exactly the six categories and a playable visual bank in each', () => {
    expect(bank.categories.map((c) => c.slug)).toEqual(['arte-literatura', 'deportes', 'historia', 'geografia', 'ciencia', 'entretenimiento']);
    expect(bank.questions.every((q) => !q.placeholder)).toBe(true);
    for (const c of bank.categories) expect(bank.questions.filter((q) => q.category === c.slug && q.kind === 'image')).toHaveLength(10);
  });

  it('keeps both formats playable at every difficulty with distinct, attributed images', () => {
    for (const c of bank.categories) {
      for (const kind of ['text', 'image']) {
        for (const difficulty of ['easy', 'medium', 'hard']) {
          expect(bank.questions.filter((q) => q.category === c.slug && q.kind === kind && q.difficulty === difficulty).length, `${c.slug}/${kind}/${difficulty}`).toBeGreaterThanOrEqual(kind === 'image' ? 3 : 10);
        }
      }
    }
    const images = bank.questions.filter((q) => q.kind === 'image');
    expect(new Set(images.map((q) => q.imageSource)).size).toBe(images.length);
    for (const q of images) {
      expect(q.imageCredit).not.toMatch(/<[^>]*>/);
      expect(q.imageSource).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    }
  });

  it('spreads the correct option across A–D and never repeats a prompt', () => {
    const real = bank.questions.filter((q) => !q.placeholder);
    const positions = [0, 1, 2, 3].map((i) => real.filter((q) => q.correct === i).length);
    for (const n of positions) expect(n).toBeGreaterThanOrEqual(real.length / 6);
    expect(new Set(bank.questions.map((q) => `${q.category}|${q.kind}|${q.prompt}|${q.imageSource ?? ''}`)).size).toBe(bank.questions.length);
  });

  it('seed.sql loads on the migrated schema and matches the JSON', async () => {
    const db = await freshDatabase();
    await db.exec(readFileSync(`${root}supabase/seed.sql`, 'utf8'));
    await db.exec(readFileSync(`${root}supabase/seed.sql`, 'utf8')); // idempotent
    const counts = (
      await db.query<{ active: number; placeholders: number }>(
        `select count(*) filter (where is_active)::int as active, count(*) filter (where is_placeholder)::int as placeholders from public.questions`,
      )
    ).rows[0]!;
    expect(counts.active).toBe(bank.questions.filter((q) => !q.placeholder).length);
    expect(counts.placeholders).toBe(bank.questions.filter((q) => q.placeholder).length);
  });
});
