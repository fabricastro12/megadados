import { CreateRoomSchema } from '@/rooms/model';
import { body, deps, respond, withUser } from '@/server/http';
import { createRoom } from '@/server/rooms/roomService';

export const POST = withUser(async (request, userId) => {
  const input = await body(request, CreateRoomSchema);
  if (!input.ok) return input.response;
  return respond(await createRoom(deps(), { userId, ...input.value }));
});
