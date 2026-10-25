import { AdminActionSchema } from '@/questions/schema';
import { adminAction, adminBank } from '@/server/admin/adminService';
import { body, deps, respond, withPermanentUser } from '@/server/http';

/** The whole question bank, answers included: admins only. */
export const GET = withPermanentUser(async (_request, userId) => respond(await adminBank(deps().db, userId)));

/** One change to the bank (save, delete, import); answers with the bank as it is afterwards. */
export const POST = withPermanentUser(async (request, userId) => {
  const parsed = await body(request, AdminActionSchema);
  if (!parsed.ok) return parsed.response;
  return respond(await adminAction(deps().db, userId, parsed.value));
});
