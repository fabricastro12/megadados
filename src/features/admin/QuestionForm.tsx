'use client';

import { type FormEvent, useState } from 'react';
import { type QuestionEdit, QuestionEditSchema } from '@/questions/schema';
import type { AdminCategory } from '@/questions/adminBank';
import { OPTION_LETTERS } from '@/features/game/catalog';
import { ImagePicker } from './ImagePicker';

const DIFFICULTY = [
  { value: 'easy', label: 'Fácil' },
  { value: 'medium', label: 'Media' },
  { value: 'hard', label: 'Difícil' },
] as const;

/** Create or edit one question; validates with the same schema the server applies. */
export function QuestionForm({
  initial,
  categories,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: QuestionEdit;
  categories: AdminCategory[];
  onSave: (q: QuestionEdit) => Promise<string | null>;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = QuestionEditSchema.safeParse({ ...q, explanation: q.explanation?.trim() || null, image: q.image?.trim() || null });
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => `${i.path.join(' ') || 'Pregunta'}: ${i.message}`));
      return;
    }
    setBusy(true);
    const error = await onSave(parsed.data);
    setBusy(false);
    setErrors(error ? [error] : []);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label={initial.id ? 'Editar pregunta' : 'Nueva pregunta'}>
      <h2 className="text-xl font-extrabold">{initial.id ? 'Editar pregunta' : 'Nueva pregunta'}</h2>
      <label className="flex flex-col gap-1 font-extrabold">
        Tipo de pregunta
        <select className="field" value={q.kind} onChange={(e) => setQ({ ...q, kind: e.target.value as QuestionEdit['kind'] })}>
          <option value="text">Trivia de texto</option>
          <option value="image">Identificar una imagen</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 font-extrabold">
        Categoría
        <select value={q.categoryId} onChange={(e) => setQ({ ...q, categoryId: e.target.value })} className="field">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-extrabold">
        Pregunta
        <textarea value={q.prompt} maxLength={300} rows={3} onChange={(e) => setQ({ ...q, prompt: e.target.value })} className="field py-2" />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-extrabold">Opciones (marcá la correcta)</legend>
        {q.options.map((option, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="correct"
              aria-label={`La ${OPTION_LETTERS[i]} es la correcta`}
              checked={q.correct === i}
              onChange={() => setQ({ ...q, correct: i })}
              className="h-6 w-6 accent-[#2CC56F]"
            />
            <span className="w-6 text-center font-[family-name:var(--font-display)]">{OPTION_LETTERS[i]}</span>
            <input
              aria-label={`Opción ${OPTION_LETTERS[i]}`}
              value={option}
              maxLength={120}
              onChange={(e) => setQ({ ...q, options: q.options.map((o, j) => (j === i ? e.target.value : o)) })}
              className={`field ${q.correct === i ? '!bg-[#DDF7E8]' : ''}`}
            />
          </div>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 font-extrabold">
          Dificultad
          <select value={q.difficulty} onChange={(e) => setQ({ ...q, difficulty: e.target.value as QuestionEdit['difficulty'] })} className="field">
            {DIFFICULTY.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-3 self-end font-extrabold">
          <input type="checkbox" role="switch" checked={q.isActive} onChange={(e) => setQ({ ...q, isActive: e.target.checked })} className="h-6 w-6 accent-[#2CC56F]" />
          Sale en las partidas
        </label>
      </div>
      <label className="flex flex-col gap-1 font-extrabold">
        Dato curioso (se muestra después de responder)
        <textarea value={q.explanation ?? ''} maxLength={500} rows={2} onChange={(e) => setQ({ ...q, explanation: e.target.value })} className="field py-2" />
      </label>
      <ImagePicker onSelect={(image) => setQ({ ...q, image: image.url, imageCredit: image.credit, imageSource: image.source })} />
      {q.image && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border-[3px] border-ink p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={q.image} alt="Vista previa de la pregunta" className="max-h-56 object-contain" />
          <p className="text-sm font-semibold">{q.imageCredit}</p>
          {q.imageSource && <a className="font-bold underline" href={q.imageSource} target="_blank" rel="noreferrer">Fuente y licencia</a>}
          <button type="button" className="btn !min-h-10 text-sm" onClick={() => setQ({ ...q, image: null, imageCredit: null, imageSource: null })}>Quitar foto</button>
        </div>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="rounded-2xl border-[3px] border-wrong bg-[#FFE3E6] p-3 text-sm font-bold">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-go" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar pregunta'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancelar
        </button>
        {onDelete &&
          (confirmDelete ? (
            <button type="button" className="btn btn-danger ml-auto" onClick={onDelete}>
              Sí, borrar
            </button>
          ) : (
            <button type="button" className="btn ml-auto" onClick={() => setConfirmDelete(true)}>
              Borrar
            </button>
          ))}
      </div>
    </form>
  );
}
