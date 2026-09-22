// PRD §10.1 — create a Public or Private Match Room ahead of a
// fixture. All validation and the room + room_matches link happen in
// ONE transaction inside create_room() (migration 0013). This route
// only authenticates, sanity-checks the payload, and maps errors.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rpcErrorResponse } from '@/lib/api/rpc-errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { name, roomType, matchId, description } = (body ?? {}) as {
    name?: unknown;
    roomType?: unknown;
    matchId?: unknown;
    description?: unknown;
  };

  if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 60) {
    return NextResponse.json({ error: 'Give your room a name (3-60 characters).' }, { status: 400 });
  }
  if (roomType !== 'match_public' && roomType !== 'private') {
    return NextResponse.json({ error: 'Invalid room type.' }, { status: 400 });
  }
  if (typeof matchId !== 'string' || !UUID.test(matchId)) {
    return NextResponse.json({ error: 'Invalid match.' }, { status: 400 });
  }
  if (description != null && (typeof description !== 'string' || description.length > 300)) {
    return NextResponse.json({ error: 'Description is too long.' }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase.rpc('create_room', {
    p_name: name,
    p_room_type: roomType,
    p_match_id: matchId,
    p_description: description ?? null,
  });

  if (error) return rpcErrorResponse(error);

  // data = { id, slug, room_code, name, room_type }
  return NextResponse.json({ room: data });
}
