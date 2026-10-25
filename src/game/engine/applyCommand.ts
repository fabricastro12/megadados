import type { Command } from '../commands';
import type { Lifeline } from '../config';
import {
  activeMembers,
  activePlayers,
  captainOf,
  currentOwnerId,
  eligibleOwners,
  isTeamPlay,
  ownerIds,
  ownerOf,
  spinnerFor,
} from '../rules/owners';
import { CROWN_BONUS, answerPoints, resolveVotes } from '../rules/scoring';
import { winnerIds } from '../rules/standings';
import type {
  Actor,
  EngineContext,
  EngineError,
  EngineResult,
  FinishReason,
  GameEvent,
  GameState,
  OwnerResult,
  PlayerStats,
} from '../types';
import {
  ANSWER_GRACE_MS,
  AUDIENCE_MS,
  CROWN_PICK_MS,
  EXTRA_TIME_MS,
  REVEAL_MS,
  ROUND_RESULTS_MS,
  SPIN_EXTRA_MS,
  SPIN_MIN_MS,
} from './constants';
import { emptyScore, shuffle } from './createGame';

type Outcome = EngineError | void;

interface Run {
  s: GameState;
  ctx: EngineContext;
  events: GameEvent[];
}

const HOST_ONLY = new Set<Command['type']>(['pause', 'resume', 'end', 'skip', 'adjustPoints', 'kick']);

/**
 * The game's single entry point: validates `command` for `actor` against the current phase and
 * returns the next state plus the events to broadcast. Pure: time and randomness come from `ctx`.
 */
export function applyCommand(state: GameState, actor: Actor, command: Command, ctx: EngineContext): EngineResult {
  if (state.phase === 'finished') return { ok: false, error: 'game_over' };
  if (HOST_ONLY.has(command.type) && actor.role !== 'host' && actor.role !== 'system') return { ok: false, error: 'not_host' };
  if (command.type === 'addPlayer' && actor.role !== 'system') return { ok: false, error: 'not_host' };
  if (state.phase === 'paused' && !['resume', 'end', 'kick', 'adjustPoints', 'addPlayer'].includes(command.type)) {
    return { ok: false, error: 'paused' };
  }

  const run: Run = { s: structuredClone(state), ctx, events: [] };
  const outcome = dispatch(run, actor, command);
  if (outcome) return { ok: false, error: outcome };
  return { ok: true, state: run.s, events: run.events };
}

function dispatch(run: Run, actor: Actor, command: Command): Outcome {
  switch (command.type) {
    case 'spin':
      return spin(run, actor);
    case 'pickCategory':
      return pickCategory(run, actor, command.categoryId);
    case 'answer':
      return answer(run, actor, command.questionId, command.choice);
    case 'vote':
      return vote(run, actor, command.questionId, command.choice);
    case 'useLifeline':
      return useLifeline(run, actor, command.lifeline);
    case 'audienceVote':
      return audienceVote(run, actor, command.questionId, command.choice);
    case 'tick':
      return tick(run, false);
    case 'skip':
      return tick(run, true);
    case 'pause':
      return pause(run);
    case 'resume':
      return resume(run);
    case 'end':
      finish(run, 'host');
      return;
    case 'adjustPoints':
      return adjustPoints(run, command.ownerId, command.delta);
    case 'kick':
      return kick(run, command.playerId);
    case 'addPlayer':
      return addPlayer(run, command.player);
  }
}

// --- Spin and category ------------------------------------------------------------------------

function spin(run: Run, actor: Actor): Outcome {
  const { s, ctx } = run;
  if (s.phase !== 'awaitingSpin') return 'wrong_phase';
  if (actor.role !== 'system' && actor.playerId !== s.spinnerId) return 'not_your_turn';
  const segments = s.categories.length + 1;
  const segment = Math.min(segments - 1, Math.floor(ctx.random() * segments));
  s.spin = {
    segment,
    categoryId: segment < s.categories.length ? s.categories[segment]! : null,
    startedAt: ctx.now,
    durationMs: SPIN_MIN_MS + Math.floor(ctx.random() * SPIN_EXTRA_MS),
    turns: 4 + Math.floor(ctx.random() * 3),
  };
  s.phase = 'spinning';
  s.phaseDeadline = ctx.now + s.spin.durationMs;
  run.events.push({ type: 'spinStarted', spin: s.spin, spinnerId: s.spinnerId });
}

function categoriesWithCards(s: GameState): string[] {
  return s.categories.filter((c) => (s.decks[c]?.length ?? 0) > 0);
}

function openCrownPick(run: Run, ownerId: string): void {
  const { s, ctx } = run;
  const playable = categoriesWithCards(s);
  const crowns = s.scores[ownerId]?.crowns ?? [];
  const missing = playable.filter((c) => !crowns.includes(c));
  const options = s.config.mode === 'clasico' && missing.length > 0 ? missing : playable;
  if (options.length === 0) {
    finish(run, 'outOfQuestions');
    return;
  }
  s.crownPick = { ownerId, options };
  s.phase = 'crownPick';
  s.phaseDeadline = ctx.now + CROWN_PICK_MS;
  run.events.push({ type: 'crownPickStarted', ownerId, options });
}

function pickCategory(run: Run, actor: Actor, categoryId: string): Outcome {
  const { s } = run;
  if (s.phase !== 'crownPick' || !s.crownPick) return 'wrong_phase';
  if (actor.role !== 'system' && actor.playerId !== s.spinnerId) return 'not_your_turn';
  if (!s.crownPick.options.includes(categoryId)) return 'invalid_category';
  drawQuestion(run, categoryId, true);
}

/** Takes the next unused card of the category, or of any category that still has cards. */
function drawQuestion(run: Run, categoryId: string, isCrown: boolean): void {
  const { s, ctx } = run;
  let category = categoryId;
  if ((s.decks[category]?.length ?? 0) === 0) {
    const fallback = categoriesWithCards(s);
    if (fallback.length === 0) {
      finish(run, 'outOfQuestions');
      return;
    }
    category = fallback[Math.floor(ctx.random() * fallback.length)]!;
  }
  const card = s.decks[category]!.shift()!;
  s.asked.push(card.id);
  const deadline = ctx.now + s.config.questionSeconds * 1000;
  s.current = {
    questionId: card.id,
    categoryId: category,
    answer: card.answer,
    isCrown,
    startedAt: ctx.now,
    deadline,
    extraMs: {},
    removed: {},
    answers: {},
    passed: [],
    votes: {},
    audience: null,
  };
  s.crownPick = null;
  s.reveal = null;
  s.phase = 'question';
  s.phaseDeadline = deadline;
  run.events.push({ type: 'questionShown', questionId: card.id, categoryId: category, isCrown });
}

// --- Answering --------------------------------------------------------------------------------

function closesAt(s: GameState, ownerId: string): number {
  return (s.current?.deadline ?? 0) + (s.current?.extraMs[ownerId] ?? 0);
}

/** The question closes when the last owner still allowed to answer runs out of time. */
function questionClosesAt(s: GameState): number {
  const pending = eligibleOwners(s).filter((o) => !s.current?.answers[o] && !s.current?.passed.includes(o));
  const owners = pending.length ? pending : eligibleOwners(s);
  return Math.max(s.current?.deadline ?? 0, ...owners.map((o) => closesAt(s, o)));
}

function everyoneDone(s: GameState): boolean {
  return eligibleOwners(s).every((o) => s.current?.answers[o] || s.current?.passed.includes(o));
}

/** Which owner an actor answers for, and whether they may answer right now. */
function answeringOwner(s: GameState, actor: Actor): { ownerId: string } | { error: EngineError } {
  const ownerId = ownerOf(s, actor.playerId);
  if (!ownerId) return { error: 'not_participant' };
  if (!eligibleOwners(s).includes(ownerId)) return { error: 'not_your_turn' };
  if (isTeamPlay(s)) {
    const mode = s.config.teams.answerMode;
    if (mode === 'vote') return { error: 'use_vote' };
    if (mode === 'captain' && captainOf(s, ownerId) !== actor.playerId) return { error: 'not_your_turn' };
  }
  return { ownerId };
}

function answer(run: Run, actor: Actor, questionId: string, choice: number): Outcome {
  const { s, ctx } = run;
  if (s.phase !== 'question' || !s.current) return 'wrong_phase';
  if (s.current.questionId !== questionId) return 'stale_question';
  const who = answeringOwner(s, actor);
  if ('error' in who) return who.error;
  const { ownerId } = who;
  if (s.current.answers[ownerId] || s.current.passed.includes(ownerId)) return 'already_answered';
  if (ctx.now > closesAt(s, ownerId) + ANSWER_GRACE_MS) return 'late';
  s.current.answers[ownerId] = { choice, at: ctx.now, byPlayerId: actor.playerId! };
  run.events.push({ type: 'answered', ownerId, playerId: actor.playerId!, choice, at: ctx.now });
  if (everyoneDone(s)) enterReveal(run);
}

function vote(run: Run, actor: Actor, questionId: string, choice: number): Outcome {
  const { s, ctx } = run;
  if (s.phase !== 'question' || !s.current) return 'wrong_phase';
  if (s.current.questionId !== questionId) return 'stale_question';
  if (!isTeamPlay(s) || s.config.teams.answerMode !== 'vote') return 'wrong_phase';
  const ownerId = ownerOf(s, actor.playerId);
  if (!ownerId) return 'not_participant';
  if (!eligibleOwners(s).includes(ownerId)) return 'not_your_turn';
  if (s.current.votes[actor.playerId!]) return 'already_answered';
  if (ctx.now > closesAt(s, ownerId) + ANSWER_GRACE_MS) return 'late';
  s.current.votes[actor.playerId!] = { choice, at: ctx.now, byPlayerId: actor.playerId! };
  run.events.push({ type: 'voted', kind: 'team', playerId: actor.playerId!, choice, at: ctx.now });
  const members = activeMembers(s, ownerId);
  if (members.every((m) => s.current!.votes[m])) {
    settleTeamVote(run, ownerId);
    enterReveal(run);
  }
}

function settleTeamVote(run: Run, teamId: string): void {
  const { s, ctx } = run;
  if (!s.current || s.current.answers[teamId]) return;
  const members = activeMembers(s, teamId);
  const votes = members.map((m) => s.current!.votes[m]).filter((v) => !!v);
  const choice = resolveVotes(votes);
  if (choice === null) return;
  const decidedAt = Math.min(ctx.now, Math.max(...votes.map((v) => v.at)));
  const first = votes.find((v) => v.choice === choice)!;
  s.current.answers[teamId] = { choice, at: decidedAt, byPlayerId: first.byPlayerId };
  run.events.push({ type: 'answered', ownerId: teamId, playerId: first.byPlayerId, choice, at: decidedAt });
}

// --- Lifelines --------------------------------------------------------------------------------

function useLifeline(run: Run, actor: Actor, lifeline: Lifeline): Outcome {
  const { s, ctx } = run;
  if (s.phase !== 'question' || !s.current) return 'wrong_phase';
  if (!s.config.lifelines[lifeline]) return 'lifeline_disabled';
  const ownerId = ownerOf(s, actor.playerId);
  if (!ownerId) return 'not_participant';
  if (!eligibleOwners(s).includes(ownerId)) return 'not_your_turn';
  const score = s.scores[ownerId]!;
  if (score.usedLifelines.includes(lifeline)) return 'lifeline_used';
  if (s.current.answers[ownerId] || s.current.passed.includes(ownerId)) return 'already_answered';

  switch (lifeline) {
    case 'fiftyFifty': {
      const wrong = [0, 1, 2, 3].filter((i) => i !== s.current!.answer);
      s.current.removed[ownerId] = shuffle(wrong, ctx.random).slice(0, 2).sort();
      break;
    }
    case 'extraTime':
      s.current.extraMs[ownerId] = (s.current.extraMs[ownerId] ?? 0) + EXTRA_TIME_MS;
      s.phaseDeadline = questionClosesAt(s);
      break;
    case 'audience':
      if (s.config.mode === 'ronda') return 'lifeline_unavailable';
      s.current.audience = { openUntil: ctx.now + AUDIENCE_MS, votes: {} };
      break;
    case 'pass':
      if (s.config.mode === 'ronda') {
        s.current.passed.push(ownerId);
      } else {
        // Classic: swap in another question of the same category, same turn.
        const { categoryId, isCrown } = s.current;
        score.usedLifelines.push(lifeline);
        run.events.push({ type: 'lifelineUsed', ownerId, lifeline });
        drawQuestion(run, categoryId, isCrown);
        return;
      }
      break;
  }
  score.usedLifelines.push(lifeline);
  run.events.push({ type: 'lifelineUsed', ownerId, lifeline });
  if (lifeline === 'pass' && everyoneDone(s)) enterReveal(run);
}

function audienceVote(run: Run, actor: Actor, questionId: string, choice: number): Outcome {
  const { s, ctx } = run;
  const audience = s.current?.audience;
  if (s.phase !== 'question' || !s.current || !audience) return 'wrong_phase';
  if (s.current.questionId !== questionId) return 'stale_question';
  if (ctx.now > audience.openUntil) return 'late';
  const voterOwner = ownerOf(s, actor.playerId);
  if (!voterOwner) return 'not_participant';
  if (eligibleOwners(s).includes(voterOwner)) return 'not_your_turn';
  if (audience.votes[actor.playerId!] !== undefined) return 'already_answered';
  audience.votes[actor.playerId!] = choice;
  run.events.push({ type: 'voted', kind: 'audience', playerId: actor.playerId!, choice, at: ctx.now });
}

// --- Reveal and progression -------------------------------------------------------------------

function bump(stats: PlayerStats | undefined, correct: boolean, ms: number): void {
  if (!stats) return;
  stats.answered += 1;
  if (correct) {
    stats.correct += 1;
    stats.fastestMs = stats.fastestMs === null ? ms : Math.min(stats.fastestMs, ms);
  }
}

function enterReveal(run: Run): void {
  const { s, ctx } = run;
  const q = s.current!;
  if (isTeamPlay(s) && s.config.teams.answerMode === 'vote') for (const o of eligibleOwners(s)) settleTeamVote(run, o);

  const results: Record<string, OwnerResult> = {};
  for (const ownerId of eligibleOwners(s)) {
    const score = (s.scores[ownerId] ??= emptyScore());
    const record = q.answers[ownerId];
    const passed = q.passed.includes(ownerId);
    const correct = !!record && record.choice === q.answer;
    const result: OwnerResult = { choice: record?.choice ?? null, correct, passed, points: 0, crownAwarded: null };

    if (record) {
      score.answered += 1;
      const cat = (score.byCategory[q.categoryId] ??= { correct: 0, total: 0 });
      cat.total += 1;
      bump(s.playerStats[record.byPlayerId], correct, record.at - q.startedAt);
      if (correct) {
        cat.correct += 1;
        score.correct += 1;
        const ms = record.at - q.startedAt;
        score.fastestMs = score.fastestMs === null ? ms : Math.min(score.fastestMs, ms);
        result.points = answerPoints({
          at: record.at,
          startedAt: q.startedAt,
          closesAt: closesAt(s, ownerId),
          double: q.isCrown && s.config.mode === 'ronda',
        });
      }
    }

    if (!passed) score.streak = correct ? score.streak + 1 : 0;
    score.bestStreak = Math.max(score.bestStreak, score.streak);

    if (s.config.mode === 'ronda' && correct && score.streak >= s.config.crownStreak) {
      score.streak = 0;
      if (!score.crowns.includes(q.categoryId)) {
        score.crowns.push(q.categoryId);
        result.crownAwarded = q.categoryId;
        result.points += CROWN_BONUS;
      }
    }
    if (s.config.mode === 'clasico' && q.isCrown) {
      score.streak = 0;
      if (correct && !score.crowns.includes(q.categoryId)) {
        score.crowns.push(q.categoryId);
        result.crownAwarded = q.categoryId;
      }
    }

    score.points += result.points;
    results[ownerId] = result;
    if (result.crownAwarded) run.events.push({ type: 'crownWon', ownerId, categoryId: result.crownAwarded });
  }

  s.reveal = { questionId: q.questionId, categoryId: q.categoryId, correct: q.answer, results };
  s.phase = 'reveal';
  s.phaseDeadline = ctx.now + REVEAL_MS;
  run.events.push({ type: 'revealed', reveal: s.reveal });
}

function crownWinner(s: GameState): boolean {
  if (s.config.winCondition !== 'allCrowns') return false;
  const all = s.categories;
  return Object.values(s.scores).some((sc) => all.every((c) => sc.crowns.includes(c)));
}

function timeIsUp(run: Run): boolean {
  return run.s.endsAt !== null && run.ctx.now >= run.s.endsAt;
}

function startSpinFor(run: Run): void {
  const { s, ctx } = run;
  s.spin = null;
  s.current = null;
  s.spinnerId = spinnerFor(s);
  if (!s.spinnerId) {
    finish(run, 'noPlayers');
    return;
  }
  s.phase = 'awaitingSpin';
  s.phaseDeadline = ctx.now + s.config.spinTimeoutSeconds * 1000;
}

function nextRound(run: Run): void {
  const { s } = run;
  s.round += 1;
  if (s.round >= s.totalRounds) return finish(run, 'rounds');
  startSpinFor(run);
  run.events.push({ type: 'roundStarted', round: s.round, spinnerId: s.spinnerId });
}

/** Classic mode: hand the wheel to the next owner; a full lap of owners is one round. */
function nextTurn(run: Run, rotateCaptain = true): void {
  const { s } = run;
  const owner = currentOwnerId(s);
  if (rotateCaptain && owner && isTeamPlay(s)) s.turn.captainIndex[owner] = (s.turn.captainIndex[owner] ?? 0) + 1;
  s.turn.questionsThisTurn = 0;
  const owners = ownerIds(s);
  s.turn.ownerIndex += 1;
  if (owners.length === 0) return finish(run, 'noPlayers');
  if (s.turn.ownerIndex >= owners.length) {
    s.turn.ownerIndex = 0;
    s.round += 1;
    if (s.round >= s.totalRounds) return finish(run, 'rounds');
  }
  startSpinFor(run);
  run.events.push({ type: 'turnChanged', ownerId: currentOwnerId(s)!, spinnerId: s.spinnerId });
}

function afterClassicReveal(run: Run): void {
  const { s } = run;
  const owner = currentOwnerId(s);
  const result = owner ? s.reveal?.results[owner] : undefined;
  const wasCrown = !!s.current?.isCrown;
  if (!owner || !result || !result.correct) return nextTurn(run);
  s.turn.questionsThisTurn += 1;
  if (s.turn.questionsThisTurn >= s.config.maxQuestionsPerTurn) return nextTurn(run);
  const score = s.scores[owner]!;
  if (!wasCrown && score.streak >= s.config.crownStreak) {
    score.streak = 0;
    s.spin = null;
    s.current = null;
    return openCrownPick(run, owner);
  }
  startSpinFor(run);
}

function tick(run: Run, force: boolean): Outcome {
  const { s, ctx } = run;
  if (s.phaseDeadline === null) return 'wrong_phase';
  const due = s.phase === 'question' ? questionClosesAt(s) + ANSWER_GRACE_MS : s.phaseDeadline;
  if (!force && ctx.now < due) return 'deadline_not_reached';

  switch (s.phase) {
    case 'awaitingSpin':
      if (s.config.mode === 'clasico' && s.config.spinTimeoutAction === 'skipTurn') return nextTurn(run);
      return spin(run, { playerId: null, role: 'system' });
    case 'spinning': {
      const landed = s.spin?.categoryId ?? null;
      if (landed) return drawQuestion(run, landed, false);
      const owner = s.config.mode === 'ronda' ? s.spinnerId! : currentOwnerId(s)!;
      return openCrownPick(run, owner);
    }
    case 'crownPick': {
      const options = s.crownPick?.options ?? [];
      return drawQuestion(run, options[Math.floor(ctx.random() * options.length)]!, true);
    }
    case 'question':
      return enterReveal(run);
    case 'reveal':
      if (crownWinner(s)) return finish(run, 'allCrowns');
      if (timeIsUp(run)) return finish(run, 'timeLimit');
      if (s.config.mode === 'ronda') {
        s.phase = 'roundResults';
        s.phaseDeadline = ctx.now + ROUND_RESULTS_MS;
        return;
      }
      return afterClassicReveal(run);
    case 'roundResults':
      if (timeIsUp(run)) return finish(run, 'timeLimit');
      return nextRound(run);
    default:
      return 'wrong_phase';
  }
}

// --- Host controls ----------------------------------------------------------------------------

function pause(run: Run): Outcome {
  const { s, ctx } = run;
  if (s.phase === 'paused') return 'wrong_phase';
  s.paused = { phase: s.phase, at: ctx.now };
  s.phase = 'paused';
  run.events.push({ type: 'paused' });
}

/** Shifts every running clock by the paused time, so nobody loses seconds to a pause. */
function resume(run: Run): Outcome {
  const { s, ctx } = run;
  if (s.phase !== 'paused' || !s.paused) return 'wrong_phase';
  const shift = ctx.now - s.paused.at;
  if (s.phaseDeadline !== null) s.phaseDeadline += shift;
  if (s.endsAt !== null) s.endsAt += shift;
  if (s.spin) s.spin.startedAt += shift;
  if (s.current) {
    s.current.startedAt += shift;
    s.current.deadline += shift;
    for (const a of Object.values(s.current.answers)) a.at += shift;
    if (s.current.audience) s.current.audience.openUntil += shift;
  }
  s.phase = s.paused.phase;
  s.paused = null;
  run.events.push({ type: 'resumed' });
}

function finish(run: Run, reason: FinishReason): void {
  const { s, ctx } = run;
  s.phase = 'finished';
  s.phaseDeadline = null;
  s.paused = null;
  s.finished = { reason, at: ctx.now, winnerIds: winnerIds(s) };
  run.events.push({ type: 'gameOver', reason, winnerIds: s.finished.winnerIds });
}

function adjustPoints(run: Run, ownerId: string, delta: number): Outcome {
  const score = run.s.scores[ownerId];
  if (!score) return 'unknown_player';
  score.points = Math.max(0, score.points + delta);
  run.events.push({ type: 'pointsAdjusted', ownerId, delta });
}

function kick(run: Run, playerId: string): Outcome {
  const { s } = run;
  const player = s.players.find((p) => p.id === playerId && p.active);
  if (!player) return 'unknown_player';
  // Remember whose turn it is before the owner list shrinks.
  const ownersBefore = ownerIds(s);
  const ownerBefore = s.config.mode === 'clasico' ? currentOwnerId(s) : null;
  player.active = false;
  run.events.push({ type: 'playerKicked', playerId });
  if (activePlayers(s).length === 0) return finish(run, 'noPlayers');

  const wasPaused = s.phase === 'paused';
  const phase = wasPaused ? s.paused!.phase : s.phase;

  if (s.config.mode === 'clasico' && ownerBefore) {
    const owners = ownerIds(s);
    const index = owners.indexOf(ownerBefore);
    if (index >= 0) {
      s.turn.ownerIndex = index;
    } else {
      // The owner whose turn it was is gone: the turn passes to whoever now sits in that slot.
      s.turn.ownerIndex = ownersBefore.indexOf(ownerBefore) - 1;
      nextTurn(run, false);
      if (wasPaused && s.phase !== 'finished') {
        s.paused = { phase: s.phase, at: run.ctx.now };
        s.phase = 'paused';
      }
      return;
    }
  }

  if (phase === 'awaitingSpin' && s.spinnerId === playerId) s.spinnerId = spinnerFor(s);
  if (phase === 'question' && !wasPaused && s.current && everyoneDone(s)) enterReveal(run);
}

function addPlayer(run: Run, player: { id: string; name: string; teamId: string | null }): Outcome {
  const { s } = run;
  if (!s.config.allowLateJoin) return 'late_join_closed';
  if (s.players.some((p) => p.id === player.id)) return;
  const teamId = s.config.teams.enabled ? player.teamId : null;
  s.players.push({ id: player.id, name: player.name, teamId, active: true });
  s.playerStats[player.id] = { correct: 0, answered: 0, fastestMs: null };
  if (teamId) s.teams.find((t) => t.id === teamId)?.memberIds.push(player.id);
  if (!isTeamPlay(s)) s.scores[player.id] = emptyScore();
  else if (teamId && !s.scores[teamId]) s.scores[teamId] = emptyScore();
  run.events.push({ type: 'playerJoined', playerId: player.id });
}
