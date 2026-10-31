'use client';

import { GameConfigSchema, PRESETS, type GameConfig } from '@/game/config';
import type { LobbySnapshot } from '@/rooms/model';

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-extrabold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`btn !min-h-11 !px-3 text-sm ${value === o.value ? 'btn-gold' : ''}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-3">
      <span className="flex-1">
        <span className="block font-extrabold">{label}</span>
        {hint && <span className="text-sm font-semibold text-ink-soft">{hint}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-6 w-6 accent-[#2CC56F]" />
    </label>
  );
}

/** Host-only game settings; every change is saved and broadcast to the room right away. */
export function RulesEditor({ config, categories, onChange }: { config: GameConfig; categories: LobbySnapshot['categories']; onChange: (c: GameConfig) => void }) {
  const set = (patch: Partial<GameConfig>) => onChange({ ...config, ...patch });
  const toggleCategory = (id: string) => {
    const has = config.categories.includes(id);
    const next = has ? config.categories.filter((c) => c !== id) : [...config.categories, id];
    if (next.length >= 2 && next.length <= 6) set({ categories: categories.map((c) => c.id).filter((c) => next.includes(c)) });
  };

  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-2 font-extrabold">
        Partida preconfigurada
        <select className="field" value="" onChange={(e) => {
          const preset = PRESETS[e.target.value as keyof typeof PRESETS];
          if (preset) onChange(GameConfigSchema.parse({ categories: config.categories, ...preset.config }));
        }}>
          <option value="" disabled>Elegí una configuración</option>
          {Object.entries(PRESETS).map(([id, preset]) => <option key={id} value={id}>{preset.name}</option>)}
        </select>
      </label>
      <Segmented
        label="Cómo se juega"
        value={config.mode}
        options={[
          { value: 'ronda', label: 'Todos a la vez' },
          { value: 'clasico', label: 'Por turnos' },
          { value: 'imagenes', label: 'Con imágenes' },
        ]}
        onChange={(mode) => set({ mode })}
      />
      <Toggle
        id="teams"
        label="Por equipos"
        hint={config.mode !== 'clasico' ? 'Cada uno responde; el equipo suma el promedio.' : 'El equipo juega su turno junto.'}
        checked={config.teams.enabled}
        onChange={(enabled) => set({ teams: { ...config.teams, enabled } })}
      />
      {config.teams.enabled && (
        <div className="flex flex-col gap-4 rounded-2xl bg-panel-alt p-3">
          <Segmented
            label="Cantidad de equipos"
            value={config.teams.count}
            options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))}
            onChange={(count) => set({ teams: { ...config.teams, count } })}
          />
          <Segmented
            label="Armado"
            value={config.teams.assignment}
            options={[
              { value: 'random', label: 'Al azar' },
              { value: 'manual', label: 'Lo armo yo' },
              { value: 'choose', label: 'Cada uno elige' },
            ]}
            onChange={(assignment) => set({ teams: { ...config.teams, assignment } })}
          />
          {config.mode === 'clasico' && (
            <Segmented
              label="Quién responde"
              value={config.teams.answerMode}
              options={[
                { value: 'captain', label: 'Capitán rotativo' },
                { value: 'vote', label: 'Votación' },
                { value: 'first', label: 'El primero' },
              ]}
              onChange={(answerMode) => set({ teams: { ...config.teams, answerMode } })}
            />
          )}
        </div>
      )}
      <Segmented
        label="Gana"
        value={config.winCondition}
        options={[
          { value: 'mostPoints', label: 'Más puntos' },
          { value: 'mostCrowns', label: 'Más coronas' },
          { value: 'allCrowns', label: 'Todas las coronas' },
          { value: 'timeLimit', label: 'Tiempo límite' },
        ]}
        onChange={(winCondition) => set({ winCondition })}
      />
      {config.winCondition === 'timeLimit' ? (
        <Segmented
          label="Minutos"
          value={config.timeLimitMinutes}
          options={[10, 15, 20, 30, 45].map((n) => ({ value: n, label: `${n} min` }))}
          onChange={(timeLimitMinutes) => set({ timeLimitMinutes })}
        />
      ) : (
        <Segmented
          label="Rondas"
          value={`${config.roundsMode}-${config.rounds}`}
          options={[
            { value: 'perPlayer-1', label: 'Cada uno gira 1 vez' },
            { value: 'perPlayer-2', label: '2 veces' },
            { value: 'fixed-10', label: '10 rondas' },
            { value: 'fixed-20', label: '20 rondas' },
          ]}
          onChange={(v) => {
            const [roundsMode, rounds] = v.split('-') as ['perPlayer' | 'fixed', string];
            set({ roundsMode, rounds: Number(rounds) });
          }}
        />
      )}
      <Segmented
        label="Tiempo por pregunta"
        value={config.questionSeconds}
        options={[10, 15, 20, 30, 45].map((n) => ({ value: n, label: `${n} s` }))}
        onChange={(questionSeconds) => set({ questionSeconds })}
      />
      <Segmented
        label="Dificultad"
        value={config.difficulty}
        options={[
          { value: 'mixed', label: 'Mezclada' },
          { value: 'easy', label: 'Fácil' },
          { value: 'medium', label: 'Media' },
          { value: 'hard', label: 'Difícil' },
        ]}
        onChange={(difficulty) => set({ difficulty })}
      />
      <fieldset>
        <legend className="mb-2 font-extrabold">Categorías en la ruleta</legend>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const on = config.categories.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleCategory(c.id)}
                className={`flex items-center gap-2 rounded-full border-[3px] border-ink px-3 py-1 text-sm font-extrabold ${on ? 'bg-white' : 'bg-panel-alt text-ink-soft line-through'}`}
              >
                <span className="h-4 w-4 rounded-full border-2 border-ink" style={{ background: c.color }} />
                {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>
      <Segmented
        label="Aciertos seguidos para una corona"
        value={config.crownStreak}
        options={[2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
        onChange={(crownStreak) => set({ crownStreak })}
      />
      <div className="flex flex-col gap-3 border-t-[3px] border-dashed border-[#D4E3F2] pt-4">
        <Toggle id="ll-5050" label="Comodín 50/50" checked={config.lifelines.fiftyFifty} onChange={(fiftyFifty) => set({ lifelines: { ...config.lifelines, fiftyFifty } })} />
        <Toggle id="ll-pass" label="Comodín pase" checked={config.lifelines.pass} onChange={(pass) => set({ lifelines: { ...config.lifelines, pass } })} />
        <Toggle
          id="ll-audience"
          label="Consulta al público"
          hint="Solo en el modo por turnos."
          checked={config.lifelines.audience}
          onChange={(audience) => set({ lifelines: { ...config.lifelines, audience } })}
        />
        <Toggle id="late-join" label="Dejar entrar con la partida empezada" checked={config.allowLateJoin} onChange={(allowLateJoin) => set({ allowLateJoin })} />
      </div>
    </div>
  );
}
