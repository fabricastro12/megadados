import { z } from 'zod';

export const LIFELINES = ['fiftyFifty', 'pass', 'audience'] as const;
export type Lifeline = (typeof LIFELINES)[number];

export const TeamsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  count: z.number().int().min(2).max(8).default(3),
  assignment: z.enum(['manual', 'random', 'choose']).default('random'),
  /** Who answers for a team in classic mode. */
  answerMode: z.enum(['captain', 'vote', 'first']).default('captain'),
});

export const LifelinesConfigSchema = z.object({
  fiftyFifty: z.boolean().default(true),
  pass: z.boolean().default(true),
  audience: z.boolean().default(true),
});

export const GameConfigSchema = z.object({
  /** 'ronda': everyone answers the same question, the spinner rotates. 'clasico': turn-based. */
  // Saved image-only rooms keep working as simultaneous play; new games mix both formats.
  mode: z.enum(['ronda', 'clasico', 'imagenes']).default('ronda').transform((mode) => mode === 'imagenes' ? 'ronda' : mode),
  teams: TeamsConfigSchema.prefault({}),
  winCondition: z.enum(['mostPoints', 'mostCrowns', 'allCrowns', 'timeLimit']).default('mostPoints'),
  /** perPlayer: every player spins `rounds` times. fixed: exactly `rounds` rounds. */
  roundsMode: z.enum(['perPlayer', 'fixed']).default('perPlayer'),
  rounds: z.number().int().min(1).max(50).default(1),
  timeLimitMinutes: z.number().int().min(5).max(120).default(30),
  questionSeconds: z.number().int().min(10).max(60).default(20),
  difficulty: z.enum(['mixed', 'easy', 'medium', 'hard']).default('mixed'),
  /** Category ids on the wheel, in order. */
  categories: z.array(z.string().min(1)).min(2).max(6).refine((ids) => new Set(ids).size === ids.length, 'Las categorías no se pueden repetir.'),
  lifelines: LifelinesConfigSchema.prefault({}),
  crownStreak: z.number().int().min(2).max(10).default(3),
  maxQuestionsPerTurn: z.number().int().min(1).max(20).default(5),
  spinTimeoutSeconds: z.number().int().min(5).max(60).default(12),
  spinTimeoutAction: z.enum(['autoSpin', 'skipTurn']).default('autoSpin'),
  allowLateJoin: z.boolean().default(true),
});

export type GameConfig = z.infer<typeof GameConfigSchema>;
export type GameConfigInput = z.input<typeof GameConfigSchema>;

/** Starting points for the host; the categories are filled in from the active ones. */
export const PRESETS = {
  'tb-rapida': { name: 'Todos a la vez', config: { mode: 'ronda', winCondition: 'mostPoints', roundsMode: 'perPlayer', rounds: 1, teams: { enabled: false } } },
  'torneo-equipos': {
    name: 'Torneo por equipos',
    config: { mode: 'ronda', teams: { enabled: true, count: 3 }, winCondition: 'mostPoints', roundsMode: 'perPlayer', rounds: 2 },
  },
  clasico: {
    name: 'Clásico por coronas',
    config: { mode: 'clasico', winCondition: 'allCrowns', roundsMode: 'fixed', rounds: 10, teams: { enabled: false } },
  },
} as const satisfies Record<string, { name: string; config: Omit<GameConfigInput, 'categories'> }>;
