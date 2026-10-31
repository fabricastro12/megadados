import { NextResponse } from 'next/server';
import { isAdmin } from '@/server/admin/adminService';
import { deps, error, withPermanentUser } from '@/server/http';
import { searchCommons } from '@/server/images/commons';

export const GET = withPermanentUser(async (request, userId) => {
  if (!(await isAdmin(deps().db, userId))) return error(403, 'not_admin');
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 2 || query.length > 100) return error(400, 'invalid_query');
  try {
    return NextResponse.json({ images: await searchCommons(query) });
  } catch {
    return error(502, 'image_bank_unavailable');
  }
});
