// PRD §10.5 Room Codes — join flow.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const { code } = await req.json();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: room } = await supabase
    .from('rooms')
    .select('id, slug, max_members')
    .eq('room_code', code.toUpperCase())
    .eq('is_archived', false)
    .maybeSingle();

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  const { count } = await supabase
    .from('room_members')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', room.id);

  if ((count ?? 0) >= room.max_members) {
    return NextResponse.json({ error: 'Room is full' }, { status: 409 });
  }

  await supabase.from('room_members').upsert({ room_id: room.id, user_id: user.id, role: 'member' });
  return NextResponse.json({ room });
}
