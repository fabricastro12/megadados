import { z } from 'zod';
import { CATEGORIES, CATEGORY_SLUGS } from './categories.ts';

export const ImageSourceSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && url.hostname === 'commons.wikimedia.org' && !url.username && !url.password && !url.port;
}, 'La fuente debe ser la página de la imagen en Wikimedia Commons.');

export const QuestionKindSchema = z.enum(['text', 'image']);
// Only the integrated image bank is fetched by the game server.
export const ImageUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && ['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname) && !url.username && !url.password && !url.port;
}, 'Seleccioná una imagen de Wikimedia Commons.');

export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);

const slug = z.enum(CATEGORY_SLUGS);

export const CategoryInputSchema = z.object({
  slug,
  name: z.string().trim().min(2).max(40),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Usá un color hexadecimal, por ejemplo #2E8BFF.'),
  icon: z.string().min(1).max(40),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
}).refine((c) => CATEGORIES.find((item) => item.slug === c.slug)?.name === c.name, { message: 'El nombre debe corresponder a una de las seis categorías del juego.', path: ['name'] });

/** One question as admins write it, in JSON or CSV import. */
export const QuestionInputSchema = z
  .object({
    category: slug,
    prompt: z.string().trim().min(5).max(300),
    options: z.array(z.string().trim().min(1).max(120)).length(4),
    correct: z.number().int().min(0).max(3),
    difficulty: DifficultySchema.default('medium'),
    explanation: z.string().trim().max(500).optional(),
    image: ImageUrlSchema.optional(),
    kind: QuestionKindSchema.default('text'),
    imageCredit: z.string().trim().max(300).optional(),
    imageSource: ImageSourceSchema.optional(),
    placeholder: z.boolean().default(false),
  })
  .refine((q) => q.kind !== 'image' || !!(q.image && q.imageCredit && q.imageSource), { message: 'Seleccioná una imagen con autor y fuente para esta pregunta.', path: ['image'] })
  .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === 4, {
    message: 'Las cuatro opciones tienen que ser distintas.',
    path: ['options'],
  });

export const QuestionBankSchema = z
  .object({
    categories: z.array(CategoryInputSchema).length(6),
    questions: z.array(QuestionInputSchema),
  })
  .refine((bank) => new Set(bank.categories.map((c) => c.slug)).size === 6, { message: 'Se necesitan las seis categorías distintas.', path: ['categories'] })
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
    image: ImageUrlSchema.nullable(),
    kind: QuestionKindSchema.default('text'),
    imageCredit: z.string().trim().max(300).nullable().default(null),
    imageSource: ImageSourceSchema.nullable().default(null),
    isActive: z.boolean(),
  })
  .refine((q) => q.kind !== 'image' || !!(q.image && q.imageCredit && q.imageSource), { message: 'Seleccioná una imagen con autor y fuente para esta pregunta.', path: ['image'] })
  .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === 4, {
    message: 'Las cuatro opciones tienen que ser distintas.',
    path: ['options'],
  });

export const AdminActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('saveQuestion'), question: QuestionEditSchema }),
  z.object({ type: z.literal('deleteQuestion'), id: z.uuid() }),
  z.object({
    type: z.literal('import'),
    categories: z.array(CategoryInputSchema).default([]),
    questions: z.array(QuestionInputSchema).max(2000),
  }),
]);

export type QuestionEdit = z.infer<typeof QuestionEditSchema>;
export type AdminAction = z.infer<typeof AdminActionSchema>;
