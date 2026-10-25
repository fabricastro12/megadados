import { deps, normalizeCode, respond, withUser } from '@/server/http';
import { loadSnapshot } from '@/server/games/gameService';

type Context = { params: Promise<{ code: string }> };

/** The current game as this seat sees it: used on load and after every reconnect. */
export const GET = withUser<Context>(async (_request, userId, { params }) => {
  const { code } = await params;
  return respond(await loadSnapshot(deps(), { roomCode: normalizeCode(code), userId }));
});
