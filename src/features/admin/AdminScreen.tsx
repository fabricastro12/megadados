'use client';

import type { Session } from '@supabase/supabase-js';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { ADMIN_ERRORS, adminApi, adminSupabase } from '@/lib/adminSupabase';
import { csvToQuestions, questionsToCsv } from '@/questions/csv';
import { type CategoryEdit, CategoryInputSchema, type QuestionEdit, QuestionInputSchema } from '@/questions/schema';
import { type AdminBank, type AdminCategory, toQuestionBank } from '@/questions/adminBank';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { Toon } from '@/ui/Toon';
import { OPTION_LETTERS } from '@/features/game/catalog';
import { QuestionForm } from './QuestionForm';

const ICONS = ['chip', 'blocks', 'book', 'mountain-sun', 'faces', 'dice'];
type Filter = 'all' | 'active' | 'inactive' | 'placeholder';
type Result = { bank: AdminBank; imported?: { added: number; skipped: number } };

function download(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

function Login({ onSession }: { onSession: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await adminSupabase().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error || !data.session) setError('El email o la contraseña no coinciden.');
    else onSession(data.session);
  };
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-5">
      <Toon size="lg" as="h1" className="text-center">
        Banco de preguntas
      </Toon>
      <form onSubmit={submit} className="sticker flex flex-col gap-3 p-5">
        <label className="flex flex-col gap-1 font-extrabold">
          Email
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="field" required />
        </label>
        <label className="flex flex-col gap-1 font-extrabold">
          Contraseña
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field" required />
        </label>
        {error && (
          <p role="alert" className="font-bold text-wrong-shade">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-go" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p className="text-center text-sm font-bold">Solo para quienes administran las preguntas de Megadados.</p>
    </main>
  );
}

function CategoryForm({ initial, onSave, onDelete, onCancel }: { initial: CategoryEdit; onSave: (c: CategoryEdit) => void; onDelete?: () => void; onCancel: () => void }) {
  const [c, setC] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = CategoryInputSchema.safeParse(c);
        if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Revisá los datos.');
        onSave({ ...parsed.data, id: c.id });
      }}
    >
      <h2 className="text-xl font-extrabold">{c.id ? 'Editar categoría' : 'Nueva categoría'}</h2>
      <label className="flex flex-col gap-1 font-extrabold">
        Nombre
        <input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} className="field" />
      </label>
      <label className="flex flex-col gap-1 font-extrabold">
        Identificador
        <input value={c.slug} onChange={(e) => setC({ ...c, slug: e.target.value.toLowerCase() })} className="field" />
      </label>
      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1 font-extrabold">
          Color
          <input type="color" value={c.color} onChange={(e) => setC({ ...c, color: e.target.value.toUpperCase() })} className="h-12 w-16 rounded-xl border-[3px] border-ink" />
        </label>
        <fieldset className="flex gap-1">
          <legend className="mb-1 font-extrabold">Ícono</legend>
          {ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              aria-label={icon}
              aria-pressed={c.icon === icon}
              onClick={() => setC({ ...c, icon })}
              className={`flex h-11 w-11 items-center justify-center rounded-xl border-[3px] ${c.icon === icon ? 'border-ink' : 'border-transparent'}`}
              style={{ background: c.color }}
            >
              <CategoryIcon icon={icon} size={24} />
            </button>
          ))}
        </fieldset>
      </div>
      <label className="flex items-center gap-3 font-extrabold">
        <input type="checkbox" role="switch" checked={c.isActive} onChange={(e) => setC({ ...c, isActive: e.target.checked })} className="h-6 w-6 accent-[#2CC56F]" />
        Disponible para la ruleta
      </label>
      {error && (
        <p role="alert" className="font-bold text-wrong-shade">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-go">
          Guardar categoría
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancelar
        </button>
        {onDelete && (
          <button type="button" className="btn ml-auto" onClick={onDelete}>
            Borrar
          </button>
        )}
      </div>
    </form>
  );
}

function ImportPanel({ bank, onImport, onClose }: { bank: AdminBank; onImport: (body: object) => Promise<void>; onClose: () => void }) {
  const [report, setReport] = useState<{ valid: unknown[]; categories: unknown[]; errors: string[] } | null>(null);
  const known = new Set(bank.categories.map((c) => c.slug));

  const read = async (file: File) => {
    const text = await file.text();
    let rows: unknown[] = [];
    let categories: unknown[] = [];
    const errors: string[] = [];
    if (file.name.toLowerCase().endsWith('.json')) {
      try {
        const json = JSON.parse(text);
        rows = Array.isArray(json) ? json : (json.questions ?? []);
        categories = Array.isArray(json) ? [] : (json.categories ?? []);
      } catch {
        errors.push('El JSON no se pudo leer.');
      }
    } else {
      const csv = csvToQuestions(text);
      if (csv.error) errors.push(csv.error);
      rows = csv.rows;
    }
    const validCategories = categories.flatMap((c, i) => {
      const parsed = CategoryInputSchema.safeParse(c);
      if (!parsed.success) errors.push(`Categoría ${i + 1}: ${parsed.error.issues[0]?.message}`);
      return parsed.success ? [parsed.data] : [];
    });
    const slugs = new Set([...known, ...validCategories.map((c) => c.slug)]);
    const valid = rows.flatMap((row, i) => {
      const parsed = QuestionInputSchema.safeParse(row);
      if (!parsed.success) {
        errors.push(`Fila ${i + 1}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
        return [];
      }
      if (!slugs.has(parsed.data.category)) {
        errors.push(`Fila ${i + 1}: la categoría “${parsed.data.category}” no existe.`);
        return [];
      }
      return [parsed.data];
    });
    setReport({ valid, categories: validCategories, errors });
  };

  return (
    <section className="flex flex-col gap-3" aria-label="Importar preguntas">
      <h2 className="text-xl font-extrabold">Importar preguntas</h2>
      <p className="text-sm font-semibold">
        JSON con el formato de <code>supabase/seed/questions.json</code>, o CSV con las columnas category, prompt, option_a, option_b, option_c, option_d, correct (A–D),
        difficulty, explanation e image. Las preguntas que ya están (mismo texto en la misma categoría) se saltean.
      </p>
      <input type="file" accept=".json,.csv,application/json,text/csv" onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} className="font-bold" />
      {report && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="font-extrabold">
            {report.valid.length} preguntas listas para importar
            {report.errors.length > 0 ? `, ${report.errors.length} con problemas (no se importan)` : ''}.
          </p>
          {report.errors.length > 0 && (
            <ul className="max-h-48 overflow-auto rounded-2xl border-[3px] border-wrong bg-[#FFE3E6] p-3 text-sm font-bold">
              {report.errors.slice(0, 50).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn btn-go self-start"
            disabled={report.valid.length === 0}
            onClick={() => void onImport({ type: 'import', categories: report.categories, questions: report.valid })}
          >
            Importar {report.valid.length}
          </button>
        </div>
      )}
      <button type="button" className="btn self-start" onClick={onClose}>
        Cerrar
      </button>
    </section>
  );
}

/** /admin: sign in with a permanent account, then browse, edit, import and export the bank. */
export function AdminScreen() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [bank, setBank] = useState<AdminBank | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [category, setCategory] = useState<string | 'all'>('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ kind: 'question'; value: QuestionEdit } | { kind: 'category'; value: CategoryEdit } | { kind: 'import' } | null>(null);

  useEffect(() => {
    void adminSupabase()
      .auth.getSession()
      .then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (!session) return;
    void adminApi<AdminBank>().then((r) => {
      if (r.ok) setBank(r.data);
      else setError(ADMIN_ERRORS[r.error] ?? 'No se pudo cargar el banco.');
    });
  }, [session]);

  const act = async (body: object): Promise<string | null> => {
    const r = await adminApi<Result>(body);
    if (!r.ok) {
      const message = ADMIN_ERRORS[r.error] ?? 'No se pudo guardar.';
      setError(message);
      return message;
    }
    setBank(r.data.bank);
    setError(null);
    setEditing(null);
    if (r.data.imported) setNotice(`Importadas ${r.data.imported.added}. Ya estaban ${r.data.imported.skipped}.`);
    return null;
  };

  const questions = useMemo(() => {
    if (!bank) return [];
    const term = search.trim().toLowerCase();
    return bank.questions.filter(
      (q) =>
        (category === 'all' || q.categoryId === category) &&
        (filter === 'all' || (filter === 'active' && q.isActive) || (filter === 'inactive' && !q.isActive && !q.isPlaceholder) || (filter === 'placeholder' && q.isPlaceholder)) &&
        (!term || q.prompt.toLowerCase().includes(term) || q.options.some((o) => o.toLowerCase().includes(term))),
    );
  }, [bank, category, filter, search]);

  if (session === undefined) return null;
  if (!session) return <Login onSession={setSession} />;

  const catOf = (id: string): AdminCategory | undefined => bank?.categories.find((c) => c.id === id);
  const blank = (): QuestionEdit => ({
    categoryId: category !== 'all' ? category : (bank?.categories[0]?.id ?? ''),
    prompt: '',
    options: ['', '', '', ''],
    correct: 0,
    difficulty: 'medium',
    explanation: null,
    image: null,
    isActive: true,
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 px-4 py-5 pr-16">
      <header className="flex flex-wrap items-center gap-3">
        <Toon size="md" as="h1">
          Banco de preguntas
        </Toon>
        <span className="ml-auto text-sm font-bold">{session.user.email}</span>
        <button
          type="button"
          className="btn !min-h-10 text-sm"
          onClick={() => void adminSupabase().auth.signOut().then(() => (setSession(null), setBank(null)))}
        >
          Salir
        </button>
      </header>

      {error && (
        <p role="alert" className="sticker px-4 py-3 font-extrabold text-wrong-shade">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="sticker px-4 py-3 font-extrabold">
          {notice}
        </p>
      )}

      {bank && (
        <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
          <nav className="sticker flex flex-col gap-1 self-start p-3" aria-label="Categorías">
            <button type="button" aria-current={category === 'all'} onClick={() => setCategory('all')} className={`rounded-xl px-3 py-2 text-left font-extrabold ${category === 'all' ? 'bg-panel-alt' : ''}`}>
              Todas <span className="text-ink-soft">({bank.questions.length})</span>
            </button>
            {bank.categories.map((c) => (
              <div key={c.id} className={`flex items-center rounded-xl ${category === c.id ? 'bg-panel-alt' : ''}`}>
                <button type="button" aria-current={category === c.id} onClick={() => setCategory(c.id)} className="flex flex-1 items-center gap-2 px-3 py-2 text-left font-extrabold">
                  <span className="h-4 w-4 flex-none rounded-full border-2 border-ink" style={{ background: c.color }} />
                  <span className={c.isActive ? '' : 'text-ink-soft line-through'}>{c.name}</span>
                  <span className="text-ink-soft">({c.questionCount})</span>
                </button>
                <button type="button" aria-label={`Editar ${c.name}`} className="px-2 text-sm font-bold underline" onClick={() => setEditing({ kind: 'category', value: { ...c } })}>
                  Editar
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn mt-2 !min-h-10 text-sm"
              onClick={() => setEditing({ kind: 'category', value: { slug: '', name: '', color: '#2E8BFF', icon: 'dice', sortOrder: bank.categories.length, isActive: true } })}
            >
              Nueva categoría
            </button>
          </nav>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="search" className="sr-only">
                Buscar
              </label>
              <input id="search" placeholder="Buscar en preguntas y opciones" value={search} onChange={(e) => setSearch(e.target.value)} className="field !min-h-11 max-w-xs" />
              <label htmlFor="filter" className="sr-only">
                Estado
              </label>
              <select id="filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="field !min-h-11 !w-auto">
                <option value="all">Todas</option>
                <option value="active">En juego</option>
                <option value="inactive">Apagadas</option>
                <option value="placeholder">Por escribir</option>
              </select>
              <button type="button" className="btn btn-go !min-h-11 text-sm" onClick={() => setEditing({ kind: 'question', value: blank() })}>
                Nueva pregunta
              </button>
              <button type="button" className="btn !min-h-11 text-sm" onClick={() => setEditing({ kind: 'import' })}>
                Importar
              </button>
              <button type="button" className="btn !min-h-11 text-sm" onClick={() => download('megadados-preguntas.json', 'application/json', JSON.stringify(toQuestionBank(bank), null, 2))}>
                Exportar JSON
              </button>
              <button type="button" className="btn !min-h-11 text-sm" onClick={() => download('megadados-preguntas.csv', 'text/csv', questionsToCsv(toQuestionBank(bank).questions))}>
                Exportar CSV
              </button>
            </div>

            {editing && (
              <div className="sticker p-5">
                {editing.kind === 'question' && (
                  <QuestionForm
                    key={editing.value.id ?? 'new'}
                    initial={editing.value}
                    categories={bank.categories}
                    onSave={(q) => act({ type: 'saveQuestion', question: q })}
                    onDelete={editing.value.id ? () => void act({ type: 'deleteQuestion', id: editing.value.id }) : undefined}
                    onCancel={() => setEditing(null)}
                  />
                )}
                {editing.kind === 'category' && (
                  <CategoryForm
                    key={editing.value.id ?? 'new'}
                    initial={editing.value}
                    onSave={(c) => void act({ type: 'saveCategory', category: c })}
                    onDelete={editing.value.id ? () => void act({ type: 'deleteCategory', id: editing.value.id }) : undefined}
                    onCancel={() => setEditing(null)}
                  />
                )}
                {editing.kind === 'import' && <ImportPanel bank={bank} onImport={async (body) => void (await act(body))} onClose={() => setEditing(null)} />}
              </div>
            )}

            <p className="text-sm font-bold text-ink-soft" aria-live="polite">
              {questions.length} preguntas
            </p>
            <ul className="flex flex-col gap-2">
              {questions.map((q) => {
                const c = catOf(q.categoryId);
                return (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() => setEditing({ kind: 'question', value: { ...q } })}
                      className="flex w-full items-start gap-3 rounded-2xl border-[3px] border-ink bg-white p-3 text-left shadow-[0_3px_0_#1C2A66] hover:bg-panel-alt"
                    >
                      <span className="mt-1 h-4 w-4 flex-none rounded-full border-2 border-ink" style={{ background: c?.color }} aria-label={c?.name} />
                      <span className="flex-1">
                        <span className="block font-extrabold">{q.prompt}</span>
                        <span className="block text-sm font-semibold text-ink-soft">
                          Correcta: {OPTION_LETTERS[q.correct]}. {q.options[q.correct]}
                        </span>
                      </span>
                      <span className="flex flex-none flex-col items-end gap-1 text-xs font-extrabold">
                        <span className="rounded-full border-2 border-ink px-2">{{ easy: 'Fácil', medium: 'Media', hard: 'Difícil' }[q.difficulty]}</span>
                        {q.isPlaceholder ? (
                          <span className="rounded-full bg-gold px-2">Por escribir</span>
                        ) : q.isActive ? (
                          <span className="rounded-full bg-go px-2 text-white">En juego</span>
                        ) : (
                          <span className="rounded-full bg-panel-alt px-2">Apagada</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}
