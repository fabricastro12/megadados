import type { QuestionInput } from './schema';

/**
 * CSV for spreadsheets: one question per row. The correct option is a letter (A–D), so a
 * person can fill it in without counting from zero.
 */
export const CSV_COLUMNS = ['category', 'prompt', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'difficulty', 'explanation', 'image', 'kind', 'image_credit', 'image_source'] as const;

const LETTERS = ['A', 'B', 'C', 'D'] as const;

/** RFC 4180: fields with commas, quotes or line breaks are quoted, quotes doubled. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === ';') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const quote = (value: string) => (/[",;\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

export function questionsToCsv(questions: QuestionInput[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const q of questions) {
    lines.push(
      [q.category, q.prompt, ...q.options, LETTERS[q.correct] ?? 'A', q.difficulty, q.explanation ?? '', q.image ?? '', q.kind, q.imageCredit ?? '', q.imageSource ?? ''].map(quote).join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Turns CSV rows into question objects for QuestionInputSchema to validate. Unknown columns are
 * ignored; a missing required column is reported once for the whole file.
 */
export function csvToQuestions(text: string): { rows: unknown[]; error: string | null } {
  const [header, ...body] = parseCsv(text);
  if (!header) return { rows: [], error: 'El archivo está vacío.' };
  const index = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  const missing = CSV_COLUMNS.slice(0, 7).filter((c) => !index.has(c));
  if (missing.length > 0) return { rows: [], error: `Faltan columnas: ${missing.join(', ')}.` };
  const cell = (row: string[], name: string) => row[index.get(name) ?? -1]?.trim() ?? '';
  const rows = body.map((row) => {
    const letter = cell(row, 'correct').toUpperCase();
    const explanation = cell(row, 'explanation');
    const image = cell(row, 'image');
    const difficulty = cell(row, 'difficulty');
    return {
      category: cell(row, 'category'),
      prompt: cell(row, 'prompt'),
      options: [cell(row, 'option_a'), cell(row, 'option_b'), cell(row, 'option_c'), cell(row, 'option_d')],
      correct: LETTERS.indexOf(letter as (typeof LETTERS)[number]) >= 0 ? LETTERS.indexOf(letter as (typeof LETTERS)[number]) : Number(letter) - 1,
      ...(difficulty ? { difficulty } : {}),
      ...(explanation ? { explanation } : {}),
      ...(image ? { image } : {}),
      kind: cell(row, 'kind') || 'text',
      ...(cell(row, 'image_credit') ? { imageCredit: cell(row, 'image_credit') } : {}),
      ...(cell(row, 'image_source') ? { imageSource: cell(row, 'image_source') } : {}),
    };
  });
  return { rows, error: null };
}
