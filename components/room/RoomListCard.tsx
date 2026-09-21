// Small link-card for a room the user is already a member of, shown
// on the home feed. Not one of the full room surfaces from PRD §10
// (that's /rooms/[id], still a stub) — just enough to identify the
// room and get there.
interface RoomListCardProps {
  id: string;
  name: string;
  roomType: string;
  isOfficial: boolean;
}

const ROOM_TYPE_LABEL: Record<string, string> = {
  general: 'Match room',
  match_public: 'Public match room',
  private: 'Private room',
  season_league: 'Season league',
  community: 'Community',
};

export function RoomListCard({ id, name, roomType, isOfficial }: RoomListCardProps) {
  return (
    <a
      href={`/rooms/${id}`}
      className="flex min-w-[180px] flex-col justify-between rounded-lg bg-ink-soft px-4 py-3 transition-colors hover:bg-white/[0.07]"
    >
      <p className="text-sm font-semibold leading-snug">{name}</p>
      <p className="mt-2 text-xs text-white/40">
        {isOfficial ? '⭐ Official' : (ROOM_TYPE_LABEL[roomType] ?? 'Room')}
      </p>
    </a>
  );
}
