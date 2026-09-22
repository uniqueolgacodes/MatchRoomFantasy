// PRD §10, recommended_rooms view (0001_init.sql / updated 0009).
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { JoinPublicRoomButton } from '@/components/room/JoinPublicRoomButton';

export default async function DiscoverRoomsPage() {
  const supabase = createClient();
  const { data: rooms } = await supabase.from('recommended_rooms').select('id, name, description, room_type, is_official, is_pinned, member_count, match_count').limit(30);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Discover Rooms</h1>
        <Link href="/rooms/new" className="rounded-full bg-pitch px-3.5 py-1.5 text-xs font-semibold hover:bg-pitch-dark">
          + New room
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        {(rooms ?? []).map((room) => (
          <div key={room.id} className="flex items-center justify-between rounded-lg bg-ink-soft px-4 py-3.5">
            <div>
              <p className="text-sm font-semibold">
                {room.is_pinned && '⭐ '}
                {room.name}
              </p>
              <p className="mt-0.5 text-xs text-white/40">
                {room.member_count} member{room.member_count === 1 ? '' : 's'}
                {room.match_count > 0 ? ` · ${room.match_count} match${room.match_count === 1 ? '' : 'es'}` : ''}
              </p>
            </div>
            <div className="w-28 shrink-0">
              <JoinPublicRoomButton roomId={room.id} />
            </div>
          </div>
        ))}
        {(!rooms || rooms.length === 0) && <p className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">No public rooms yet.</p>}
      </div>
    </main>
  );
}
