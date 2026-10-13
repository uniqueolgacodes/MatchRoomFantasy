import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { formatKickoff } from '@/lib/utils/format';
import { EditRoomForm, type EditMatchOption } from '@/components/room/EditRoomForm';

export default async function EditRoomPage({ params }: { params: { id: string } }) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null; // Middleware handles redirect

    const { data: room } = await supabase
        .from('rooms')
        .select('id, name, owner_id, is_archived')
        .eq('id', params.id)
        .maybeSingle();

    if (!room) notFound();

    // Security check: only the owner can edit, and archived rooms cannot be edited
    if (room.owner_id !== user.id || room.is_archived) {
        redirect(`/rooms/${room.id}`);
    }

    // 1. Fetch currently linked match IDs
    const { data: linked } = await supabase.from('room_matches').select('match_id').eq('room_id', room.id);
    const linkedIds = (linked || []).map((rm) => rm.match_id);
    const linkedFilter = linkedIds.length > 0 ? `id.in.(${linkedIds.join(',')})` : 'id.eq.00000000-0000-0000-0000-000000000000';

    // 2. Fetch matches: Everything currently linked (to show lock status), PLUS upcoming scheduled ones to add
    const { data: matches } = await supabase
        .from('matches')
        .select('id, home_team_id, away_team_id, kickoff, status')
        .eq('is_virtual', false)
        .or(`${linkedFilter},status.eq.scheduled`)
        .order('kickoff', { ascending: true })
        .limit(40);

    const teamIds = Array.from(new Set((matches ?? []).flatMap((m) => [m.home_team_id, m.away_team_id])));
    const { data: teams } = teamIds.length > 0 ? await supabase.from('teams').select('id, short_name').in('id', teamIds) : { data: [] };
    const teamsById = new Map((teams ?? []).map((t) => [t.id, t.short_name]));

    const options: EditMatchOption[] = (matches ?? []).map((m) => ({
        id: m.id,
        label: `${teamsById.get(m.home_team_id) ?? '?'} vs ${teamsById.get(m.away_team_id) ?? '?'} — ${formatKickoff(m.kickoff)}`,
        isLocked: m.status !== 'scheduled',
        isLinked: linkedIds.includes(m.id),
    }));

    return (
        <main className="mx-auto max-w-md px-4 py-8">
            <Link href={`/rooms/${room.id}`} className="inline-flex items-center gap-1 text-sm text-white/50 transition-colors hover:text-white">
                ← Back to {room.name}
            </Link>

            <h1 className="mt-6 font-display text-2xl font-bold">Edit Matches</h1>
            <p className="mt-1 text-sm text-white/60">
                Add upcoming matches, or remove ones that haven&apos;t kicked off yet. Matches that have already started are locked in.
            </p>

            <EditRoomForm roomId={room.id} matches={options} />
        </main>
    );
}