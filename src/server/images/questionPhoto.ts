import { ImageUrlSchema } from '@/questions/schema';
import { gameRepository as repo } from '../games/gameRepository';
import { type ServiceDeps, type ServiceResult, fail } from '../games/gameService';

const MAX_BYTES = 8 * 1024 * 1024;

/** Only room members can fetch the current photo. Filenames and metadata never reach players. */
export async function questionPhoto(
  deps: ServiceDeps,
  input: { code: string; questionId: string; userId: string },
  fetcher: typeof fetch = fetch,
): Promise<ServiceResult<{ bytes: ArrayBuffer; contentType: string }>> {
  const result = await deps.db.transaction(async (tx): Promise<ServiceResult<string>> => {
    const room = await repo.findRoom(tx, input.code);
    if (!room) return fail('no_room');
    if (!(await repo.findSeat(tx, room.id, input.userId))) return fail('not_in_room');
    const game = await repo.latestGame(tx, room.id);
    if (!game || game.state.current?.questionId !== input.questionId || !['question', 'reveal', 'roundResults', 'paused'].includes(game.state.phase)) return fail('not_found');
    const question = await repo.questionContent(tx, input.questionId);
    const image = ImageUrlSchema.safeParse(question?.image_url);
    return image.success ? { ok: true, value: image.data } : fail('not_found');
  });
  if (!result.ok) return result;
  try {
    const response = await fetcher(result.value, { redirect: 'error', next: { revalidate: 86400 }, signal: AbortSignal.timeout(12000) });
    const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';
    if (!response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(contentType) || Number(response.headers.get('content-length')) > MAX_BYTES) return fail('image_unavailable');
    // Bound the streamed body too: a provider may omit or understate Content-Length.
    const reader = response.body?.getReader();
    if (!reader) return fail('image_unavailable');
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); return fail('image_unavailable'); }
      chunks.push(value);
    }
    if (!length) return fail('image_unavailable');
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { ok: true, value: { bytes: bytes.buffer, contentType } };
  } catch {
    return fail('image_unavailable');
  }
}
