// components/virtual/VirtualHub.tsx
'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LiveMatchCard, type MyPick } from './LiveMatchCard';
import { UpcomingSetCard } from './UpcomingSetCard';
import { BuddyCommentator } from '@/components/buddy/BuddyCommentator';
import { useAuth } from '@/providers/AuthProvider';
import { VirtualStandings, type StandingsRow } from './VirtualStandings';
import type { Market, StakeInfo } from '@/components/room/PredictionCard';
import type { TickerEvent } from './EventTicker';

// ... (keep the same TS interfaces as before: TeamInfo, LiveMatch, UpcomingMatch, UpcomingSet)
interface TeamInfo { id: string; name: string; shortName: string; primaryColor: string; secondaryColor: string; }
interface LiveMatch { id: string; home: TeamInfo; away: TeamInfo; homeScore: number; awayScore: number; minute: number; status: 'live' | 'full_time'; events: TickerEvent[]; picks: MyPick[]; }
interface UpcomingMatch { id: string; home: TeamInfo; away: TeamInfo; markets: Market[]; }
interface UpcomingSet { kickoff: string; matches: UpcomingMatch[]; }

interface VirtualHubProps {
  liveMatches: LiveMatch[];
  upcomingSets: UpcomingSet[];
  initialBalance: number;
  initialStakes: Record<string, StakeInfo>;
  standings: StandingsRow[];
  seasonInfo: { number: number; matchday: number };
}

export function VirtualHub({ liveMatches: initialLiveMatches, upcomingSets: initialUpcomingSets, initialBalance, initialStakes, standings, seasonInfo }: VirtualHubProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [liveMatches, setLiveMatches] = useState(initialLiveMatches);
  const [upcomingSets, setUpcomingSets] = useState(initialUpcomingSets);
  const [latestEvent, setLatestEvent] = useState<{ event: TickerEvent; teamName: string } | null>(null);

  // Mobile Tab State
  const [activeTab, setActiveTab] = useState<'matches' | 'table'>('matches');

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

        setUpcomingSets((prev) => prev.map((set) => ({ ...set, matches: set.matches.filter((m) => m.id !== row.id) })).filter((set) => set.matches.length > 0));
        setLiveMatches((prev) => {
          if (prev.some((m) => m.id === match.id)) return prev;
          return [...prev, { id: match.id, home: match.home, away: match.away, homeScore: 0, awayScore: 0, minute: 0, status: 'live', events: [], picks }];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [initialStakes]);

  const MatchesContent = (
    <div className="flex flex-col gap-6 w-full">
      {showBuddy && <BuddyCommentator latestEvent={latestEvent} />}

      {liveMatches.length > 0 && (
        <section>
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/40 mb-3">Live Matchday</h2>
          <div className="flex flex-col gap-3">
            {liveMatches.map((match) => (
              <LiveMatchCard
                key={match.id} matchId={match.id} home={match.home} away={match.away} initialHomeScore={match.homeScore} initialAwayScore={match.awayScore}
                initialMinute={match.minute} initialStatus={match.status} initialEvents={match.events} picks={match.picks}
                onNewEvent={(ev, teamName) => setLatestEvent({ event: ev, teamName })}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/40 mb-3">Next Matchday</h2>
        {upcomingSets.length > 0 ? (
          <div className="flex flex-col gap-3">
            {upcomingSets.map((set) => (
              <UpcomingSetCard key={set.kickoff} kickoff={set.kickoff} matches={set.matches} stakes={initialStakes} balance={balance} onBalanceChange={setBalance} />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/40">
            Next matchday spawning soon...
          </p>
        )}
      </section>
    </div>
  );

  const TableContent = (
    <div className="w-full">
      <VirtualStandings standings={standings} />
    </div>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            Season {seasonInfo.number} <span className="text-sm font-medium text-pitch-light px-2 py-0.5 rounded-full bg-pitch/10">MD {seasonInfo.matchday}</span>
          </h1>
          <p className="mt-1 text-sm text-white/50">Full matchdays every 8 minutes.</p>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/selections" className="text-xs font-medium text-white/70 hover:text-white underline underline-offset-4">
            My Selections
          </Link>
          <div className="flex flex-col items-end rounded-lg bg-pitch/15 px-3.5 py-2">
            <span className="text-lg font-bold leading-none text-pitch-light">{balance}</span>
            <span className="mt-0.5 text-[11px] font-medium text-white/50">Match Points</span>
          </div>
        </div>
      </div>

      {/* Mobile Tabs */}
      <div className="flex lg:hidden bg-ink-soft p-1 rounded-lg mb-6">
        <button onClick={() => setActiveTab('matches')} className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${activeTab === 'matches' ? 'bg-pitch text-white' : 'text-white/50'}`}>Matches</button>
        <button onClick={() => setActiveTab('table')} className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${activeTab === 'table' ? 'bg-pitch text-white' : 'text-white/50'}`}>League Table</button>
      </div>

      {/* Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className={`lg:col-span-2 ${activeTab === 'matches' ? 'block' : 'hidden lg:block'}`}>
          {MatchesContent}
        </div>
        <div className={`lg:col-span-1 ${activeTab === 'table' ? 'block' : 'hidden lg:block'}`}>
          <div className="sticky top-6">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/40 mb-3 hidden lg:block">League Table</h2>
            {TableContent}
          </div>
        </div>
      </div>
    </div>
  );
}