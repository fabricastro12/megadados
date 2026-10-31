import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deps, error, normalizeCode, respond, withUser } from '@/server/http';
import { questionPhoto } from '@/server/images/questionPhoto';

type Context = { params: Promise<{ code: string }> };

export const GET = withUser<Context>(async (request, userId, { params }) => {
  const { code } = await params;
  const questionId = z.uuid().safeParse(new URL(request.url).searchParams.get('question'));
  if (!questionId.success) return error(400, 'invalid_command');
  const photo = await questionPhoto(deps(), { code: normalizeCode(code), questionId: questionId.data, userId });
  if (!photo.ok) return respond(photo);
  return new NextResponse(photo.value.bytes, { headers: {
    'content-type': photo.value.contentType, 'cache-control': 'private, no-store',
    'content-disposition': 'inline; filename="question-image"', 'x-content-type-options': 'nosniff',
  } });
});
