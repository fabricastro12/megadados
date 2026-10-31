import { describe, expect, it } from 'vitest';
import { csvToQuestions, parseCsv, questionsToCsv } from '@/questions/csv';
import { QuestionInputSchema } from '@/questions/schema';

describe('CSV', () => {
  it('reads quoted fields with commas, quotes and line breaks', () => {
    expect(parseCsv('a,"b, c","say ""hi""","two\nlines"\r\nx,y,z,w\n')).toEqual([
      ['a', 'b, c', 'say "hi"', 'two\nlines'],
      ['x', 'y', 'z', 'w'],
    ]);
  });

  it('accepts semicolons, as spreadsheets in Spanish export them', () => {
    expect(parseCsv('a;b;c')).toEqual([['a', 'b', 'c']]);
  });

  it('round-trips questions through CSV', () => {
    const question = QuestionInputSchema.parse({
      category: 'geografia',
      prompt: '¿Qué lago comparten Perú y Bolivia? (el "más alto")',
      options: ['Titicaca', 'Poopó', 'Maracaibo', 'General Carrera'],
      correct: 0,
      difficulty: 'easy',
      explanation: 'Está a 3812 m, en el altiplano.',
    });
    const { rows, error } = csvToQuestions(questionsToCsv([question]));
    expect(error).toBeNull();
    expect(QuestionInputSchema.parse(rows[0])).toEqual(question);
  });

  it('takes the correct option as a letter or as 1–4', () => {
    const csv = 'category,prompt,option_a,option_b,option_c,option_d,correct\nx,Pregunta uno,a,b,c,d,c\nx,Pregunta dos,a,b,c,d,4\n';
    expect(csvToQuestions(csv).rows.map((r) => (r as { correct: number }).correct)).toEqual([2, 3]);
  });

  it('reports missing columns', () => {
    expect(csvToQuestions('category,prompt\nx,y').error).toMatch(/option_a/);
  });
});
