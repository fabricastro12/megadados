import { JoinRoomSchema } from '@/rooms/model';
import { body, deps, normalizeCode, respond, withUser } from '@/server/http';
import { joinRoom } from '@/server/rooms/roomService';

type Context = { params: Promise<{ code: string }> };

export const POST = withUser<Context>(async (request, userId, { params }) => {
  const { code } = await params;
  const join = await body(request, JoinRoomSchema);
  if (!join.ok) return join.response;
  return respond(await joinRoom(deps(), { code: normalizeCode(code), userId, join: join.value }));
});
