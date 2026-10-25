import type { CategoryInput, QuestionBank, QuestionEdit } from './schema';

/** The bank as the admin panel sees it: ids, counts and every flag. Shared by server and panel. */
export interface AdminCategory extends CategoryInput {
  id: string;
  questionCount: number;
}

export interface AdminQuestion extends QuestionEdit {
  id: string;
  isPlaceholder: boolean;
}

export interface AdminBank {
  categories: AdminCategory[];
  questions: AdminQuestion[];
}

/** The bank in the seed file's format (categories by slug), for the JSON export. */
export function toQuestionBank(bank: AdminBank): QuestionBank {
  const slugOf = new Map(bank.categories.map((c) => [c.id, c.slug]));
  return {
    categories: bank.categories.map(({ slug, name, color, icon, sortOrder, isActive }) => ({ slug, name, color, icon, sortOrder, isActive })),
    questions: bank.questions.map((q) => ({
      category: slugOf.get(q.categoryId)!,
      prompt: q.prompt,
      options: q.options,
      correct: q.correct,
      difficulty: q.difficulty,
      ...(q.explanation ? { explanation: q.explanation } : {}),
      ...(q.image ? { image: q.image } : {}),
      placeholder: q.isPlaceholder,
    })),
  };
}
