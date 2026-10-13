'use client';
// Top-level client boundary for /virtual.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LiveMatchCard, type MyPick } from './LiveMatchCard';
import { UpcomingSetCard } from './UpcomingSetCard';
import { BuddyCommentator } from '@/components/buddy/BuddyCommentator';
import { useAuth } from '@/providers/AuthProvider';
import type { Market, StakeInfo } from '@/components/room/PredictionCard';
import type { TickerEvent } from './EventTicker';

interface TeamInfo {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
}

interface LiveMatch {
  id: string;
  home: TeamInfo;
  away: TeamInfo;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: 'live' | 'full_time';
  events: TickerEvent[];
  picks: MyPick[];
}

interface UpcomingMatch {
  id: string;
  home: TeamInfo;
  away: TeamInfo;
  markets: Market[];
}

interface UpcomingSet {
  kickoff: string;
  matches: UpcomingMatch[];
}

interface VirtualHubProps {
  liveMatches: LiveMatch[];
  upcomingSets: UpcomingSet[];
  initialBalance: number;
  initialStakes: Record<string, StakeInfo>;
}

export function VirtualHub({ liveMatches: initialLiveMatches, upcomingSets: initialUpcomingSets, initialBalance, initialStakes }: VirtualHubProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [liveMatches, setLiveMatches] = useState(initialLiveMatches);
  const [upcomingSets, setUpcomingSets] = useState(initialUpcomingSets);
  const [latestEvent, setLatestEvent] = useState<{ event: TickerEvent; teamName: string } | null>(null);

  const { profile } = useAuth();
  const showBuddy = profile?.buddy_enabled ?? true;

  const upcomingMatchesRef = useRef<Map<string, UpcomingMatch>>(new Map());
  useEffect(() => {
    upcomingMatchesRef.current = new Map(upcomingSets.flatMap((set) => set.matches.map((m) => [m.id, m])));
  }, [upcomingSets]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('virtual-hub-kickoff-watch')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, (payload) => {
        const row = payload.new as { id: string; status: string };
        if (row.status === 'scheduled') return;
        const match = upcomingMatchesRef.current.get(row.id);
        if (!match) return;

        const picks: MyPick[] = match.markets
          .filter((m) => initialStakes[m.id])
          .map((m) => ({ question: m.question, answer: initialStakes[m.id].answer, stake: initialStakes[m.id].stake }));

        setUpcomingSets((prev) =>
          prev.map((set) => ({ ...set, matches: set.matches.filter((m) => m.id !== row.id) })).filter((set) => set.matches.length > 0)
        );
        setLiveMatches((prev) => {
          if (prev.some((m) => m.id === match.id)) return prev;
          return [...prev, { id: match.id, home: match.home, away: match.away, homeScore: 0, awayScore: 0, minute: 0, status: 'live', events: [], picks }];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Virtual Matches</h1>
          <p className="mt-0.5 text-sm text-white/50">15-minute matches, every hour, round the clock.</p>
        </div>
        <div className="flex flex-col items-end rounded-lg bg-pitch/15 px-3.5 py-2">
          <span className="text-lg font-bold leading-none text-pitch-light">{balance}</span>
          <span className="mt-0.5 text-[11px] font-medium text-white/50">Match Points</span>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Link
          href="/selections"
          className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white"
        >
          My Selections →
        </Link>
      </div>

      {liveMatches.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/40 mb-3">Live now</h2>

          {showBuddy && (
            <div className="mb-4">
              <BuddyCommentator latestEvent={latestEvent} />
            </div>
          )}

          <div className="flex flex-col gap-3">
            {liveMatches.map((match) => (
              <LiveMatchCard
                key={match.id}
                matchId={match.id}
                home={match.home}
                away={match.away}
                initialHomeScore={match.homeScore}
                initialAwayScore={match.awayScore}
                initialMinute={match.minute}
                initialStatus={match.status}
                initialEvents={match.events}
                picks={match.picks}
                onNewEvent={(ev, teamName) => setLatestEvent({ event: ev, teamName })}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/40">Upcoming</h2>
        {upcomingSets.length > 0 ? (
          <div className="mt-3 flex flex-col gap-3">
            {upcomingSets.map((set) => (
              <UpcomingSetCard
                key={set.kickoff}
                kickoff={set.kickoff}
                matches={set.matches}
                stakes={initialStakes}
                balance={balance}
                onBalanceChange={setBalance}
              />
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/40">
            Next set spawns at the top of the hour — check back shortly.
          </p>
        )}
      </section>
    </div>
  );
}