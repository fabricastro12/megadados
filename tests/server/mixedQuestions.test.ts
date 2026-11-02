import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameState } from '@/game';
import { gameRepository } from '@/server/games/gameRepository';
import { executeCommand, loadSnapshot, startGame } from '@/server/games/gameService';
import { createRoom, getLobby, lobbyAction } from '@/server/rooms/roomService';
import { freshDatabase, U } from '../db/harness';
import { pgliteDatabase } from './pgliteDatabase';

describe('mixed text and image questions', () => {
  let pg: Awaited<ReturnType<typeof freshDatabase>>;
  let deps: { db: ReturnType<typeof pgliteDatabase>; now: () => number; random: () => number };
  let now: number;
  let code: string;

  beforeEach(async () => {
    pg = await freshDatabase();
    await pg.exec(readFileSync(new URL('../../supabase/seed.sql', import.meta.url), 'utf8'));
    now = 1_800_000_000_000;
    deps = { db: pgliteDatabase(pg), now: () => now, random: () => 0 };
    const created = await createRoom(deps, { userId: U.host, name: 'Host', avatar: { color: 'blue', face: 'happy' } });
    if (!created.ok) throw new Error(created.error);
    code = created.value.code;
  });

  afterEach(async () => { await pg.close(); });

  const game = async () => (await pg.query<{ state: GameState }>('select state from public.games order by seq desc limit 1')).rows[0]!.state;
  const snapshot = async () => {
    const result = await loadSnapshot(deps, { roomCode: code, userId: U.host });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };
  const send = (command: unknown) => executeCommand(deps, { roomCode: code, userId: U.host, command });

  it.each(['ronda', 'clasico'] as const)('%s draws and resolves both formats from one shuffled deck', async (mode) => {
    const lobby = await getLobby(deps, { code, userId: U.host });
    if (!lobby.ok) throw new Error(lobby.error);
    const categoryIds = lobby.value.categories.map(c => c.id);
    const fullPool = await gameRepository.questionPool(deps.db, categoryIds, 'mixed');
    expect(fullPool).toHaveLength(300);

    // Keep one easy question of each format in two categories. Other difficulties and
    // categories stay active, so the game must still respect both lobby filters.
    const categories = categoryIds.slice(0, 2);
    const selected = (await pg.query<{ id: string; kind: string }>(
      `select distinct on (category_id, kind) id, kind from public.questions
       where category_id = any($1::uuid[]) and difficulty = 'easy' order by category_id, kind, id`, [categories],
    )).rows;
    expect(selected).toHaveLength(4);
    await pg.query(`update public.questions set is_active = false
      where category_id = any($1::uuid[]) and difficulty = 'easy' and id <> all($2::uuid[])`, [categories, selected.map(q => q.id)]);
    expect((await lobbyAction(deps, { code, userId: U.host, action: { type: 'updateConfig', config: {
      ...lobby.value.room.config, mode, categories, difficulty: 'easy', roundsMode: 'fixed', rounds: 4,
    } } })).ok).toBe(true);
    expect((await startGame(deps, { roomCode: code, userId: U.host })).ok).toBe(true);

    const decks = Object.values((await game()).decks).flat();
    expect(decks.map(q => q.id).sort()).toEqual(selected.map(q => q.id).sort());
    const formats = new Set<string>();
    const asked = new Set<string>();
    for (let i = 0; i < 2; i++) {
      expect((await send({ type: 'spin' })).ok).toBe(true);
      now = (await game()).phaseDeadline! + 300;
      expect((await send({ type: 'tick' })).ok).toBe(true);
      const before = await snapshot();
      expect(before.state.mode).toBe(mode);
      expect(before.state.phase).toBe('question');
      const content = before.question!;
      const question = (await pg.query<{ kind: string; correct_index: number }>('select kind, correct_index from public.questions where id = $1', [content.id])).rows[0]!;
      formats.add(question.kind);
      asked.add(content.id);
      expect(content.imageCredit).toBeNull();
      expect(content.imageSource).toBeNull();
      expect(content.imageUrl).toBe(question.kind === 'image' ? `/api/rooms/${code}/image?question=${content.id}` : null);
      expect((await send({ type: 'answer', questionId: content.id, choice: question.correct_index })).ok).toBe(true);
      const revealed = await snapshot();
      expect(revealed.state.phase).toBe('reveal');
      if (question.kind === 'image') {
        expect(revealed.question!.imageCredit).toBeTruthy();
        expect(revealed.question!.imageSource).toContain('commons.wikimedia.org');
      }
      // Ronda has a results screen; classic continues the answering player's turn.
      for (let step = 0; step < 3 && (await game()).phase !== 'awaitingSpin'; step++) {
        now = (await game()).phaseDeadline! + 300;
        expect((await send({ type: 'tick' })).ok).toBe(true);
      }
      expect((await game()).phase).toBe('awaitingSpin');
    }
    expect(formats).toEqual(new Set(['text', 'image']));
    expect(asked.size).toBe(2);
    expect((await game()).asked).toHaveLength(2);
  });

  it('opens legacy image rooms and resumes saved matches as simultaneous play', async () => {
    await pg.query(`update public.rooms set config = jsonb_set(config, '{mode}', '"imagenes"') where code = $1`, [code]);
    const lobby = await getLobby(deps, { code, userId: U.host });
    if (!lobby.ok) throw new Error(lobby.error);
    expect(lobby.value.room.config.mode).toBe('ronda');
    expect((await startGame(deps, { roomCode: code, userId: U.host })).ok).toBe(true);
    expect(Object.values((await game()).decks).flat()).toHaveLength(300);

    // A match saved before this release can still be loaded and accept commands.
    await pg.exec(`update public.games set state = jsonb_set(state, '{config,mode}', '"imagenes"')`);
    expect((await snapshot()).state.mode).toBe('ronda');
    expect((await send({ type: 'spin' })).ok).toBe(true);
    expect((await game()).config.mode).toBe('ronda');
  });
});
