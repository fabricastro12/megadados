import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateEnvelope } from '@/server/games/gameService';
import { executeCommand, loadSnapshot, startGame } from '@/server/games/gameService';
import { createRoom, joinRoom, lobbyAction } from '@/server/rooms/roomService';
import { searchCommons } from '@/server/images/commons';
import { questionPhoto } from '@/server/images/questionPhoto';
import { ImageUrlSchema, QuestionEditSchema } from '@/questions/schema';
import { freshDatabase, U } from '../db/harness';
import { pgliteDatabase } from './pgliteDatabase';

describe('the Commons image bank', () => {
  it('keeps only usable images and plain credits, with a daily provider cache', async () => {
    const good = { title: 'File:Singer.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/singer.jpg', thumburl: 'https://thumb.wikimedia.org/singer.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Singer.jpg', mime: 'image/jpeg', extmetadata: { Artist: { value: '<a href="x">Photo Author</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] };
    const fetcher = vi.fn().mockResolvedValue(Response.json({ query: { pages: { one: good, svg: { ...good, imageinfo: [{ ...good.imageinfo[0], mime: 'image/svg+xml' }] }, external: { ...good, imageinfo: [{ ...good.imageinfo[0], thumburl: 'https://attacker.example/image.jpg' }] } } } }));
    expect(await searchCommons('singer', fetcher)).toEqual([{ title: 'Singer.jpg', url: 'https://thumb.wikimedia.org/singer.jpg', source: 'https://commons.wikimedia.org/wiki/File:Singer.jpg', credit: 'Photo Author · CC BY-SA 4.0', license: 'CC BY-SA 4.0' }]);
    expect(fetcher.mock.calls[0]?.[1].next.revalidate).toBe(86400);
  });

  it('refuses non-bank URLs and visual questions without a selected photo', () => {
    expect(ImageUrlSchema.safeParse('http://127.0.0.1/private').success).toBe(false);
    expect(ImageUrlSchema.safeParse('https://upload.wikimedia.org.attacker.example/photo.jpg').success).toBe(false);
    expect(QuestionEditSchema.safeParse({ categoryId: U.host, prompt: '¿Quién es?', options: ['A', 'B', 'C', 'D'], correct: 0, difficulty: 'easy', explanation: null, image: null, kind: 'image', isActive: true }).success).toBe(false);
  });
});

describe('a visual match', () => {
  let pg: Awaited<ReturnType<typeof freshDatabase>>;
  let deps: { db: ReturnType<typeof pgliteDatabase>; now: () => number; random: () => number };
  let now: number;
  let code: string;
  beforeEach(async () => {
    pg = await freshDatabase();
    await pg.exec(readFileSync(new URL('../../supabase/seed.sql', import.meta.url), 'utf8'));
    now = Date.now();
    deps = { db: pgliteDatabase(pg), now: () => now, random: () => 0 };
    const created = await createRoom(deps, { userId: U.host, name: 'Host', avatar: { color: 'blue', face: 'happy' } });
    if (!created.ok) throw new Error(created.error);
    code = created.value.code;
    const lobby = await lobbyAction(deps, { code, userId: U.host, action: { type: 'heartbeat' } });
    if (!lobby.ok) throw new Error(lobby.error);
    await lobbyAction(deps, { code, userId: U.host, action: { type: 'updateConfig', config: { ...lobby.value.room.config, mode: 'imagenes' } } });
    await joinRoom(deps, { code, userId: U.spectator, join: { as: 'spectator' } });
    await startGame(deps, { roomCode: code, userId: U.host });
    await executeCommand(deps, { roomCode: code, userId: U.host, command: { type: 'spin' } });
    const snap = await loadSnapshot(deps, { roomCode: code, userId: U.host });
    if (!snap.ok) throw new Error(snap.error);
    now = snap.value.state.phaseDeadline!;
    await executeCommand(deps, { roomCode: code, userId: U.spectator, command: { type: 'tick' } });
  });

  const snapshot = async (): Promise<StateEnvelope> => {
    const r = await loadSnapshot(deps, { roomCode: code, userId: U.host });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  it('only draws visual questions and hides filenames and credits until reveal', async () => {
    const snap = await snapshot();
    expect(snap.question?.imageUrl).toBe(`/api/rooms/${code}/image?question=${snap.question?.id}`);
    expect(snap.question?.imageCredit).toBeNull();
    expect(snap.question?.imageSource).toBeNull();
    const q = (await pg.query<{ kind: string; correct_index: number }>('select kind, correct_index from public.questions where id = $1', [snap.question!.id])).rows[0]!;
    expect(q.kind).toBe('image');
    await executeCommand(deps, { roomCode: code, userId: U.host, command: { type: 'answer', questionId: snap.question!.id, choice: q.correct_index } });
    expect((await snapshot()).question?.imageCredit).toBeTruthy();
    expect((await snapshot()).question?.imageSource).toContain('commons.wikimedia.org');
  });

  it('serves the active photo to members and the TV, but not strangers or other question IDs', async () => {
    const questionId = (await snapshot()).question!.id;
    const fetcher = vi.fn().mockImplementation(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }));
    expect((await questionPhoto(deps, { code, questionId, userId: U.spectator }, fetcher)).ok).toBe(true);
    fetcher.mockClear();
    expect(await questionPhoto(deps, { code, questionId, userId: U.stranger }, fetcher)).toMatchObject({ ok: false, error: 'not_in_room' });
    expect(await questionPhoto(deps, { code, questionId: U.host, userId: U.host }, fetcher)).toMatchObject({ ok: false, error: 'not_found' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports a provider failure and rejects an unsafe response type', async () => {
    const questionId = (await snapshot()).question!.id;
    const fetcher = vi.fn().mockRejectedValue(new Error('network'));
    expect(await questionPhoto(deps, { code, questionId, userId: U.host }, fetcher)).toMatchObject({ ok: false, error: 'image_unavailable' });
    fetcher.mockResolvedValue(new Response('<html/>', { headers: { 'content-type': 'text/html' } }));
    expect(await questionPhoto(deps, { code, questionId, userId: U.host }, fetcher)).toMatchObject({ ok: false, error: 'image_unavailable' });
  });
});
