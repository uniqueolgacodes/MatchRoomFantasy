// PRD §10 Room System — full "Your Rooms" list. The home feed shows
// a teaser of this same data; this is the full list plus entry
// points to create or discover more.
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { RoomListCard } from '@/components/room/RoomListCard';

export default async function RoomsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // middleware already redirects

  const { data } = await supabase.from('room_members').select('rooms(id, name, room_type, is_official, is_pinned)').eq('user_id', user.id);

  const rooms = (data ?? [])
    .map((row) => row.rooms as { id: string; name: string; room_type: string; is_official: boolean; is_pinned: boolean } | null)
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => (a.is_pinned === b.is_pinned ? 0 : a.is_pinned ? -1 : 1));

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Your Rooms</h1>
        <div className="flex gap-2">
          <Link href="/rooms/join" className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs font-medium text-white/70 hover:border-white/25">
            Join by code
          </Link>
          <Link href="/rooms/discover" className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs font-medium text-white/70 hover:border-white/25">
            Discover
          </Link>
        </div>
      </div>

      {rooms.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {rooms.map((room) => (
            <RoomListCard key={room.id} id={room.id} name={room.name} roomType={room.room_type} isOfficial={room.is_official} />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-white/10 px-4 py-8 text-center">
          <p className="text-sm text-white/40">You haven't joined any rooms yet.</p>
          <Link href="/rooms/discover" className="mt-2 inline-block text-sm font-semibold text-pitch-light hover:text-pitch">
            Discover rooms →
          </Link>
        </div>
      )}
    </main>
  );
}
