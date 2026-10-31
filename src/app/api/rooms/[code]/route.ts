import { LobbyActionSchema } from '@/rooms/model';
import { body, deps, normalizeCode, respond, withUser } from '@/server/http';
import { getLobby, lobbyAction } from '@/server/rooms/roomService';

type Context = { params: Promise<{ code: string }> };

/** Lobby snapshot: room, config, players, teams and categories. */
export const GET = withUser<Context>(async (_request, userId, { params }) => {
  const { code } = await params;
  return respond(await getLobby(deps(), { code: normalizeCode(code), userId }));
});

/** Lobby actions: profile, settings, teams, host claim, heartbeat. */
export const POST = withUser<Context>(async (request, userId, { params }) => {
  const { code } = await params;
  const action = await body(request, LobbyActionSchema);
  if (!action.ok) return action.response;
  return respond(await lobbyAction(deps(), { code: normalizeCode(code), userId, action: action.value }));
});
