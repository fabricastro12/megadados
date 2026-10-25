import { deps, normalizeCode, respond, withUser } from '@/server/http';
import { startGame } from '@/server/games/gameService';

type Context = { params: Promise<{ code: string }> };

/** Host only: starts the first game or a rematch with the room's current settings. */
export const POST = withUser<Context>(async (_request, userId, { params }) => {
  const { code } = await params;
  return respond(await startGame(deps(), { roomCode: normalizeCode(code), userId }));
});
