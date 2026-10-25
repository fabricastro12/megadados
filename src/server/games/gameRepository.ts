import type { GameState, Lifeline, RevealState } from '@/game';
import type { SqlExecutor } from '../db/database';

export interface RoomRow {
  id: string;
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  config: unknown;
}

export interface SeatRow {
  id: string;
  role: 'host' | 'player' | 'spectator';
  team_id: string | null;
}

export interface LockedGame {
  id: string;
  room_id: string;
  /** 1 for the room's first game, 2 for the rematch, and so on. */
  seq: number;
  state: GameState;
  version: number;
}

export interface QuestionContent {
  id: string;
  prompt: string;
  options: string[];
  explanation: string | null;
  image_url: string | null;
}

const ms = (value: number | null) => (value === null ? null : value / 1000);

/** Every SQL statement the game server runs lives here (adapter for the Database port). */
export const gameRepository = {
  async findRoom(tx: SqlExecutor, code: string, lock = false): Promise<RoomRow | null> {
    const rows = await tx.query<RoomRow>(
      `select id, code, status, config from public.rooms where code = $1 ${lock ? 'for update' : ''}`,
      [code],
    );
    return rows[0] ?? null;
  },

  async findSeat(tx: SqlExecutor, roomId: string, userId: string): Promise<SeatRow | null> {
    const rows = await tx.query<SeatRow>(
      `select id, role, team_id from public.players where room_id = $1 and user_id = $2 and kicked_at is null`,
      [roomId, userId],
    );
    return rows[0] ?? null;
  },

  async touchSeat(tx: SqlExecutor, seatId: string): Promise<void> {
    await tx.query(`update public.players set last_seen_at = now() where id = $1`, [seatId]);
  },

  async lobbyPlayers(tx: SqlExecutor, roomId: string) {
    return tx.query<{ id: string; name: string; team_id: string | null }>(
      `select id, name, team_id from public.players
        where room_id = $1 and kicked_at is null and role in ('host', 'player')
        order by joined_at, id`,
      [roomId],
    );
  },

  async teams(tx: SqlExecutor, roomId: string) {
    return tx.query<{ id: string; name: string }>(`select id, name from public.teams where room_id = $1 order by sort_order, name`, [
      roomId,
    ]);
  },

  /** Playable questions with their answer key, for building the decks. */
  async questionPool(tx: SqlExecutor, categoryIds: string[], difficulty: string) {
    return tx.query<{ id: string; category_id: string; correct_index: number }>(
      `select id, category_id, correct_index from public.questions
        where is_active and category_id = any($1::uuid[]) and ($2 = 'mixed' or difficulty::text = $2)`,
      [categoryIds, difficulty],
    );
  },

  /** The latest game in the room, row-locked so concurrent commands apply one after another. */
  async lockLatestGame(tx: SqlExecutor, roomId: string): Promise<LockedGame | null> {
    const rows = await tx.query<LockedGame>(
      `select id, room_id, seq, state, version from public.games where room_id = $1 order by seq desc limit 1 for update`,
      [roomId],
    );
    return rows[0] ?? null;
  },

  async latestGame(tx: SqlExecutor, roomId: string): Promise<LockedGame | null> {
    const rows = await tx.query<LockedGame>(
      `select id, room_id, seq, state, version from public.games where room_id = $1 order by seq desc limit 1`,
      [roomId],
    );
    return rows[0] ?? null;
  },

  async insertGame(tx: SqlExecutor, roomId: string, state: GameState): Promise<{ id: string; seq: number }> {
    const rows = await tx.query<{ id: string; seq: number }>(
      `insert into public.games (room_id, seq, phase, state, version, phase_deadline_at)
       values ($1, coalesce((select max(seq) from public.games where room_id = $1), 0) + 1, $2, $3::text::jsonb, 1, to_timestamp($4))
       returning id, seq`,
      [roomId, state.phase, JSON.stringify(state), ms(state.phaseDeadline)],
    );
    return rows[0]!;
  },

  async saveGame(tx: SqlExecutor, gameId: string, state: GameState, version: number): Promise<void> {
    await tx.query(
      `update public.games
          set state = $2::text::jsonb, version = $3, phase = $4, phase_deadline_at = to_timestamp($5),
              ended_at = case when $4 = 'finished' then coalesce(ended_at, now()) else ended_at end
        where id = $1`,
      [gameId, JSON.stringify(state), version, state.phase, ms(state.phaseDeadline)],
    );
  },

  async setRoomStatus(tx: SqlExecutor, roomId: string, status: RoomRow['status']): Promise<void> {
    await tx.query(`update public.rooms set status = $2 where id = $1`, [roomId, status]);
  },

  async recordQuestion(tx: SqlExecutor, gameId: string, questionId: string, categoryId: string, isCrown: boolean): Promise<void> {
    await tx.query(
      `insert into public.game_questions (game_id, question_id, category_id, is_crown) values ($1, $2, $3, $4)
       on conflict (game_id, question_id) do nothing`,
      [gameId, questionId, categoryId, isCrown],
    );
  },

  /** The unique constraint is the last line of defense against a double answer. */
  async recordAnswer(
    tx: SqlExecutor,
    input: { gameId: string; questionId: string; playerId: string; teamId: string | null; choice: number; at: number },
  ): Promise<void> {
    await tx.query(
      `insert into public.answers (game_question_id, player_id, team_id, choice, received_at)
       select gq.id, $3, $4, $5, to_timestamp($6) from public.game_questions gq
        where gq.game_id = $1 and gq.question_id = $2`,
      [input.gameId, input.questionId, input.playerId, input.teamId, input.choice, input.at / 1000],
    );
  },

  async settleAnswers(tx: SqlExecutor, gameId: string, reveal: RevealState): Promise<void> {
    for (const [ownerId, result] of Object.entries(reveal.results)) {
      if (result.choice === null) continue;
      await tx.query(
        `update public.answers a set is_correct = $4, points = $5
           from public.game_questions gq
          where a.game_question_id = gq.id and gq.game_id = $1 and gq.question_id = $2
            and (a.player_id = $3 or a.team_id = $3)`,
        [gameId, reveal.questionId, ownerId, result.correct, result.points],
      );
    }
  },

  async recordLifeline(tx: SqlExecutor, gameId: string, ownerId: string, lifeline: Lifeline): Promise<void> {
    await tx.query(
      `insert into public.lifeline_uses (game_id, owner_id, lifeline) values ($1, $2, $3::public.lifeline_kind) on conflict do nothing`,
      [gameId, ownerId, lifeline],
    );
  },

  async kickSeat(tx: SqlExecutor, seatId: string): Promise<void> {
    await tx.query(`update public.players set kicked_at = now() where id = $1`, [seatId]);
  },

  async questionContent(tx: SqlExecutor, questionId: string): Promise<QuestionContent | null> {
    const rows = await tx.query<QuestionContent>(
      `select id, prompt, options, explanation, image_url from public.questions where id = $1`,
      [questionId],
    );
    return rows[0] ?? null;
  },

  /** Realtime Broadcast from inside the transaction: delivered only if the transaction commits. */
  async broadcast(tx: SqlExecutor, topic: string, event: string, payload: unknown): Promise<void> {
    await tx.query(`select realtime.send($1::text::jsonb, $2, $3, true)`, [JSON.stringify(payload), event, topic]);
  },
};
