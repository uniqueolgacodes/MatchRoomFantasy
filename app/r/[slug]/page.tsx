// PRD §10.6 WhatsApp Share
// Resolves the shareable slug into an actual room ID, or routes 
// the user to the join-by-code page if the room is private.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function RoomRedirectPage({ params }: { params: { slug: string } }) {
  const supabase = createClient();

  // Try to find the room.
  const { data: room } = await supabase
    .from('rooms')
    .select('id')
    .eq('slug', params.slug)
    .maybeSingle();

  if (room?.id) {
    // Room is public (or the user is already a member) — send them straight there.
    // The middleware will automatically prompt them to log in if they aren't.
    redirect(`/rooms/${room.id}`);
  }

  // If RLS blocked it (because it's a Private room and they are logged out or not a member)
  // or it simply doesn't exist, route them to the join-by-code page. 
  // They can type in the 6-character code that was attached to their WhatsApp invite message!
  redirect('/rooms/join');
}