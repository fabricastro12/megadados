import { z } from 'zod';

export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);

const slug = z.string().regex(/^[a-z0-9-]{2,40}$/, 'Usá minúsculas, números y guiones.');

export const CategoryInputSchema = z.object({
  slug,
  name: z.string().trim().min(2).max(40),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Usá un color hexadecimal, por ejemplo #2E8BFF.'),
  icon: z.string().min(1).max(40),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

/** One question as admins write it, in JSON or CSV import. */
export const QuestionInputSchema = z
  .object({
    category: slug,
    prompt: z.string().trim().min(5).max(300),
    options: z.array(z.string().trim().min(1).max(120)).length(4),
    correct: z.number().int().min(0).max(3),
    difficulty: DifficultySchema.default('medium'),
    explanation: z.string().trim().max(500).optional(),
    image: z.url().optional(),
    placeholder: z.boolean().default(false),
  })
  .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === 4, {
    message: 'Las cuatro opciones tienen que ser distintas.',
    path: ['options'],
  });

export const QuestionBankSchema = z
  .object({
    categories: z.array(CategoryInputSchema).min(1),
    questions: z.array(QuestionInputSchema),
  })
  .refine((bank) => bank.questions.every((q) => bank.categories.some((c) => c.slug === q.category)), {
    message: 'Hay preguntas de una categoría que no existe.',
    path: ['questions'],
  });

export type CategoryInput = z.infer<typeof CategoryInputSchema>;
export type QuestionInput = z.infer<typeof QuestionInputSchema>;
export type QuestionBank = z.infer<typeof QuestionBankSchema>;

/** A question as the admin panel edits it, by category id. */
export const QuestionEditSchema = z
  .object({
    id: z.uuid().optional(),
    categoryId: z.uuid(),
    prompt: z.string().trim().min(5).max(300),
    options: z.array(z.string().trim().min(1).max(120)).length(4),
    correct: z.number().int().min(0).max(3),
    difficulty: DifficultySchema,
    explanation: z.string().trim().max(500).nullable(),
    image: z.url().nullable(),
    isActive: z.boolean(),
  })
  .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === 4, {
    message: 'Las cuatro opciones tienen que ser distintas.',
    path: ['options'],
  });

export const CategoryEditSchema = CategoryInputSchema.extend({ id: z.uuid().optional() });

export const AdminActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('saveCategory'), category: CategoryEditSchema }),
  z.object({ type: z.literal('deleteCategory'), id: z.uuid() }),
  z.object({ type: z.literal('saveQuestion'), question: QuestionEditSchema }),
  z.object({ type: z.literal('deleteQuestion'), id: z.uuid() }),
  z.object({
    type: z.literal('import'),
    categories: z.array(CategoryInputSchema).default([]),
    questions: z.array(QuestionInputSchema).max(2000),
  }),
]);

export type QuestionEdit = z.infer<typeof QuestionEditSchema>;
export type CategoryEdit = z.infer<typeof CategoryEditSchema>;
export type AdminAction = z.infer<typeof AdminActionSchema>;
