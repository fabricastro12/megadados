import { deps, normalizeCode, respond, withUser } from '@/server/http';
import { executeCommand } from '@/server/games/gameService';

type Context = { params: Promise<{ code: string }> };

/** Every in-game action goes through here; the engine on the server decides what happens. */
export const POST = withUser<Context>(async (request, userId, { params }) => {
  const { code } = await params;
  const command = await request.json().catch(() => null);
  return respond(await executeCommand(deps(), { roomCode: normalizeCode(code), userId, command }));
});
