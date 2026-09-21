// PRD §10.4 Room Codes — join flow.
//
// Joining goes through join_room_by_code() (migration 0009): it looks up the
// room by code (private rooms included), enforces capacity and bans, and
// inserts the membership. Clients can no longer write room_members directly.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rpcErrorResponse } from '@/lib/api/rpc-errors';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const code = (body as { code?: unknown } | null)?.code;
  if (typeof code !== 'string' || code.trim() === '' || code.length > 12) {
    return NextResponse.json({ error: 'Enter a valid room code.' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase.rpc('join_room_by_code', { p_code: code });
  if (error) return rpcErrorResponse(error);

  // data = { id, slug, name, room_type, already_member }
  return NextResponse.json({ room: data });
}
