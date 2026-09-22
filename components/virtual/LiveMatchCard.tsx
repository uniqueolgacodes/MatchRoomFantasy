'use client';
// The first real use of Supabase Realtime in the app — everything
// else in the codebase so far renders server-fetched state on load
// and stops there. This subscribes to two postgres_changes streams
// scoped to one match: score/minute/status updates on `matches`, and
// new rows on `match_events` as they're inserted by
// advance-virtual-matches. Real matches will be able to reuse this
// exact pattern once their own live pipeline is worth animating.
//
// `picks` is server-fetched once (see /virtual/page.tsx for why it
// has to be a separate query from the regular pre-match markets
// fetch — a live match's predictions have already flipped to
// `locked`, same as a real match's do at kickoff) and rendered
// as-is; it doesn't need to be live-updated, since you can't place a
// new one once the match has started.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TeamBadge } from './TeamBadge';
import { EventTicker, type TickerEvent } from './EventTicker';

interface TeamInfo {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
}

export interface MyPick {
  question: string;
  answer: string;
  stake: number;
}

interface LiveMatchCardProps {
  matchId: string;
  home: TeamInfo;
  away: TeamInfo;
  initialHomeScore: number;
  initialAwayScore: number;
  initialMinute: number;
  initialStatus: 'live' | 'full_time';
  initialEvents: TickerEvent[];
  picks: MyPick[];
}

export function LiveMatchCard({
  matchId,
  home,
  away,
  initialHomeScore,
  initialAwayScore,
  initialMinute,
  initialStatus,
  initialEvents,
  picks,
}: LiveMatchCardProps) {
  const [homeScore, setHomeScore] = useState(initialHomeScore);
  const [awayScore, setAwayScore] = useState(initialAwayScore);
  const [minute, setMinute] = useState(initialMinute);
  const [status, setStatus] = useState(initialStatus);
  const [events, setEvents] = useState(initialEvents);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`virtual-match:${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        (payload) => {
          const row = payload.new as { home_score: number | null; away_score: number | null; minute: number | null; status: string };
          if (row.home_score !== null) setHomeScore(row.home_score);
          if (row.away_score !== null) setAwayScore(row.away_score);
          if (row.minute !== null) setMinute(row.minute);
          if (row.status === 'full_time') setStatus('full_time');
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` },
        (payload) => {
          const row = payload.new as { id: string; type: string; minute: number; team_id: string };
          const teamShortName = row.team_id === home.id ? home.shortName : away.shortName;
          setEvents((prev) => [{ id: row.id, type: row.type, minute: row.minute, teamShortName }, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, home.id, home.shortName, away.id, away.shortName]);

  return (
    <div className="rounded-xl border border-white/10 bg-ink-soft p-5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-floodlight">
          {status === 'live' ? (
            <>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-floodlight" />
              LIVE — {minute}'
            </>
          ) : (
            <span className="text-white/40">FULL TIME</span>
          )}
        </span>
        <span className="text-xs text-white/30">Virtual match</span>
      </div>

      <div className="mt-4 flex items-center justify-center gap-6">
        <TeamColumn team={home} />
        <span className="font-display text-2xl font-bold tabular-nums">
          {homeScore} – {awayScore}
        </span>
        <TeamColumn team={away} />
      </div>

      {picks.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5 border-t border-white/10 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/30">Your picks</p>
          {picks.map((pick, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-white/50">{pick.question}</span>
              <span className="font-semibold text-pitch-light">
                {pick.answer} · {pick.stake} MP
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 border-t border-white/10 pt-4">
        <EventTicker events={events} />
      </div>
    </div>
  );
}

function TeamColumn({ team }: { team: TeamInfo }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <TeamBadge shortName={team.shortName} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} />
      <span className="text-xs font-semibold text-white/70">{team.name}</span>
    </div>
  );
}
