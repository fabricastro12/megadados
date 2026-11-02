import type { GameConfig } from '@/game/config';

/** One plain sentence describing the rules, for the lobby and the TV. */
export function rulesSummary(config: GameConfig): string {
  const how =
    config.mode !== 'clasico'
      ? 'Cada ronda gira uno distinto y responden todos a la vez'
      : 'Por turnos: cada uno gira y responde en su turno';
  const teams = config.teams.enabled ? `, en ${config.teams.count} equipos` : '';
  const rounds =
    config.winCondition === 'timeLimit'
      ? `durante ${config.timeLimitMinutes} minutos`
      : config.roundsMode === 'perPlayer'
        ? config.rounds === 1
          ? 'hasta que cada uno gire una vez'
          : `hasta que cada uno gire ${config.rounds} veces`
        : `durante ${config.rounds} rondas`;
  const win = {
    mostPoints: 'Gana quien sume más puntos',
    mostCrowns: 'Gana quien junte más coronas',
    allCrowns: 'Gana el primero en juntar todas las coronas',
    timeLimit: 'Gana quien sume más puntos',
  }[config.winCondition];
  return `${how}${teams}, ${rounds}. Preguntas de texto y con imágenes. ${config.questionSeconds} s por pregunta. ${win}.`;
}
