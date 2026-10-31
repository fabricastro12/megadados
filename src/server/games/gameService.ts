import { randomInt } from 'node:crypto';
import {
  type Actor,
  type Command,
  type EngineError,
  type GameEvent,
  type GameState,
  type PrivateView,
  type PublicGameState,
  CommandSchema,
  GameConfigSchema,
  applyCommand,
  createGame,
  privateViewFor,
  toPublicState,
} from '@/game';
import type { Database, SqlExecutor } from '../db/database';
import { type LockedGame, type SeatRow, gameRepository as repo } from './gameRepository';

export interface ServiceDeps {
  db: Database;
  now?: () => number;
  random?: () => number;
}

/** Uniform in [0, 1) from the OS CSPRNG: the wheel's result is decided here, never in a browser. */
export function cryptoRandom(): number {
  return randomInt(0, 2 ** 47) / 2 ** 47;
}

export type ServiceError =
  | EngineError
  | 'invalid_command'
  | 'no_room'
  | 'not_in_room'
  | 'no_game'
  | 'already_playing'
  | 'room_closed'
  | 'wrong_pin'
  | 'host_present'
  | 'unauthenticated'
  | 'not_admin'
  | 'not_found'
  | 'slug_taken'
  | 'category_not_empty'
  | 'unknown_category'
  | 'no_questions'
  | 'image_unavailable';

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: ServiceError; status: number };

const STATUS: Partial<Record<ServiceError, number>> = {
  invalid_command: 400,
  image_unavailable: 502,
  unauthenticated: 401,
  wrong_pin: 403,
  no_room: 404,
  no_game: 404,
  not_in_room: 403,
  not_host: 403,
  not_participant: 403,
  not_your_turn: 403,
  not_admin: 403,
  not_found: 404,
};

export function fail<T>(error: ServiceError): ServiceResult<T> {
  return { ok: false, error, status: STATUS[error] ?? 409 };
}

/** What clients get: the public state, the question's text while it is on screen, and the version. */
export interface StateEnvelope {
  /** Which game of the room (a rematch is a new one); versions restart with each game. */
  game: number;
  version: number;
  state: PublicGameState;
  question: { id: string; prompt: string; options: string[]; imageUrl: string | null; imageCredit: string | null; imageSource: string | null; explanation: string | null } | null;
}

export const topics = {
  room: (code: string) => `room:${code}`,
  screens: (code: string) => `room:${code}:screens`,
};

async function envelope(tx: SqlExecutor, game: number, state: GameState, version: number, code: string): Promise<StateEnvelope> {
  const view = toPublicState(state);
  const questionId = view.question?.id;
  const content = questionId ? await repo.questionContent(tx, questionId) : null;
  return {
    game,
    version,
    state: view,
    question: content
      ? {
          id: content.id,
          prompt: content.prompt,
          options: content.options,
          imageUrl: content.image_url ? `/api/rooms/${code}/image?question=${encodeURIComponent(content.id)}` : null,
          imageCredit: view.reveal ? content.image_credit : null,
          imageSource: view.reveal ? content.image_source : null,
          // The explanation would hint at the answer, so it waits for the reveal like the answer does.
          explanation: view.reveal ? content.explanation : null,
        }
      : null,
  };
}

function actorFor(seat: SeatRow): Actor {
  return { playerId: seat.role === 'spectator' ? null : seat.id, role: seat.role };
}

/** Side tables and broadcasts derived from what the engine reported. */
async function persistEvents(tx: SqlExecutor, code: string, game: LockedGame, next: GameState, events: GameEvent[]) {
  for (const e of events) {
    switch (e.type) {
      case 'questionShown':
        await repo.recordQuestion(tx, game.id, e.questionId, e.categoryId, e.isCrown);
        break;
      case 'answered': {
        const teamId = next.players.find((p) => p.id === e.playerId)?.teamId ?? null;
        await repo.recordAnswer(tx, { gameId: game.id, questionId: next.current!.questionId, playerId: e.playerId, teamId, choice: e.choice, at: e.at });
        // The TV shows who answered, never what.
        await repo.broadcast(tx, topics.screens(code), 'answered', { ownerId: e.ownerId, playerId: e.playerId });
        break;
      }
      case 'voted':
        // A team vote that settles the question also reveals it, so read the id from before.
        await repo.recordVote(tx, { gameId: game.id, questionId: game.state.current!.questionId, playerId: e.playerId, kind: e.kind, choice: e.choice, at: e.at });
        break;
      case 'revealed':
        await repo.settleAnswers(tx, game.id, e.reveal);
        break;
      case 'lifelineUsed':
        await repo.recordLifeline(tx, game.id, e.ownerId, e.lifeline);
        await repo.broadcast(tx, topics.screens(code), 'lifeline', { ownerId: e.ownerId, lifeline: e.lifeline });
        break;
      case 'gameOver':
        await repo.setRoomStatus(tx, game.room_id, 'finished');
        break;
      default:
        break;
    }
  }
}

/** Host only: builds the decks from the question bank and starts a game (also a rematch). */
export async function startGame(deps: ServiceDeps, input: { roomCode: string; userId: string }): Promise<ServiceResult<{ version: number }>> {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? cryptoRandom;
  return deps.db.transaction(async (tx) => {
    const room = await repo.findRoom(tx, input.roomCode, true);
    if (!room) return fail('no_room');
    const seat = await repo.findSeat(tx, room.id, input.userId);
    if (!seat) return fail('not_in_room');
    if (seat.role !== 'host') return fail('not_host');
    if (room.status === 'playing') return fail('already_playing');

    const parsed = GameConfigSchema.safeParse(room.config);
    if (!parsed.success) return fail('invalid_command');
    const config = parsed.data;
    const [players, teams, pool] = [
      await repo.lobbyPlayers(tx, room.id),
      await repo.teams(tx, room.id),
      await repo.questionPool(tx, config.categories, config.difficulty, config.mode === 'imagenes' ? 'image' : 'text'),
    ];
    if (pool.length === 0) return fail('no_questions');
    const created = createGame(
      {
        config,
        players: players.map((p) => ({ id: p.id, name: p.name, teamId: p.team_id })),
        teams,
        questions: pool.map((q) => ({ id: q.id, categoryId: q.category_id, answer: q.correct_index })),
      },
      { now: now(), random },
    );
    if (!created.ok) return fail(created.error);

    const game = await repo.insertGame(tx, room.id, created.state);
    await repo.setRoomStatus(tx, room.id, 'playing');
    await repo.broadcast(tx, topics.room(room.code), 'state', await envelope(tx, game.seq, created.state, 1, room.code));
    return { ok: true, value: { version: 1 } };
  });
}

/**
 * Runs one player command: lock the game row, apply the engine, save, record, broadcast, commit.
 * Two clients racing (two ticks, two taps) are serialized by the row lock; the second one is
 * evaluated against the state the first one left.
 */
export async function executeCommand(
  deps: ServiceDeps,
  input: { roomCode: string; userId: string; command: unknown },
): Promise<ServiceResult<{ version: number }>> {
  const parsed = CommandSchema.safeParse(input.command);
  if (!parsed.success || parsed.data.type === 'addPlayer') return fail('invalid_command');
  const command: Command = parsed.data;
  const now = deps.now ?? Date.now;
  const random = deps.random ?? cryptoRandom;

  return deps.db.transaction(async (tx) => {
    const room = await repo.findRoom(tx, input.roomCode);
    if (!room) return fail('no_room');
    const seat = await repo.findSeat(tx, room.id, input.userId);
    if (!seat) return fail('not_in_room');
    const result = await applyInTransaction(tx, room, actorFor(seat), command, { now: now(), random });
    if (result.ok) await repo.touchSeat(tx, seat.id);
    return result;
  });
}

/** The core of a command, for callers that already hold a transaction (also used for late joins). */
export async function applyInTransaction(
  tx: SqlExecutor,
  room: { id: string; code: string },
  actor: Actor,
  command: Command,
  ctx: { now: number; random: () => number },
): Promise<ServiceResult<{ version: number }>> {
  const game = await repo.lockLatestGame(tx, room.id);
  if (!game) return fail('no_game');
  const result = applyCommand(game.state, actor, command, ctx);
  if (!result.ok) return fail(result.error);
  const version = game.version + 1;
  await repo.saveGame(tx, game.id, result.state, version);
  await persistEvents(tx, room.code, game, result.state, result.events);
  await repo.broadcast(tx, topics.room(room.code), 'state', await envelope(tx, game.seq, result.state, version, room.code));
  return { ok: true, value: { version } };
}

/** Everything a client needs to (re)join a game in progress: used on load and after a reconnect. */
export async function loadSnapshot(
  deps: ServiceDeps,
  input: { roomCode: string; userId: string },
): Promise<ServiceResult<StateEnvelope & { you: PrivateView | null; seatId: string; role: SeatRow['role'] }>> {
  return deps.db.transaction(async (tx) => {
    const room = await repo.findRoom(tx, input.roomCode);
    if (!room) return fail('no_room');
    const seat = await repo.findSeat(tx, room.id, input.userId);
    if (!seat) return fail('not_in_room');
    const game = await repo.latestGame(tx, room.id);
    if (!game) return fail('no_game');
    await repo.touchSeat(tx, seat.id);
    return {
      ok: true,
      value: {
        ...(await envelope(tx, game.seq, game.state, game.version, room.code)),
        you: seat.role === 'spectator' ? null : privateViewFor(game.state, seat.id),
        seatId: seat.id,
        role: seat.role,
      },
    };
  });
}
