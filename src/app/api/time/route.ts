import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Server clock for client offset estimation; every countdown is computed against it. */
export function GET() {
  return NextResponse.json({ now: Date.now() }, { headers: { 'cache-control': 'no-store' } });
}
