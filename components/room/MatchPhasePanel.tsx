'use client';
// Shown wherever a match has no open markets. There is no live
// in-play feed for real matches (only half-time and full-time
// checkpoints), so this shows what is actually known: that the match
// is on, the last score the checkpoints recorded, and the user's own
// locked picks, then flips to final results by itself when the
// `matches` row changes.
//
// No Date.now() during the first render (it would differ between
// server and client and trigger a hydration error, as Countdown.tsx
// did). The "kicked off N min ago" figure is set in an effect.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import type { MatchPhase, PickSummary } from '@/lib/matches/phase';

interface MatchPhasePanelProps {
    matchId: string;
    phase: MatchPhase;
    kickoff: string;
    minute: number | null;
    homeName: string;
    awayName: string;
    homeScore: number | null;
    awayScore: number | null;
    isVirtual?: boolean;
    picks: PickSummary[];
}

const WATCHED: MatchPhase[] = ['in_play', 'half_time', 'awaiting_result'];

export function MatchPhasePanel({
    matchId,
    phase,
    kickoff,
    minute,
    homeName,
    awayName,
    homeScore,
    awayScore,
    isVirtual = false,
    picks,
}: MatchPhasePanelProps) {
    const router = useRouter();
    const reduceMotion = useReducedMotion();
    const [elapsed, setElapsed] = useState<number | null>(null);
    const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Refresh the server data when the match row changes (half-time or
    // full-time poll, or a virtual tick). One channel per viewer, and
    // only while the match is unfinished.
    useEffect(() => {
        if (!WATCHED.includes(phase)) return;
        const supabase = createClient();
        const channel = supabase
            .channel(`match-phase:${matchId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, () => {
                clearTimeout(refreshTimer.current);
                refreshTimer.current = setTimeout(() => router.refresh(), 1500);
            })
            .subscribe();
        return () => {
            clearTimeout(refreshTimer.current);
            supabase.removeChannel(channel);
        };
    }, [matchId, phase, router]);

    useEffect(() => {
        if (phase !== 'in_play') return;
        const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(kickoff).getTime()) / 60000)));
        tick();
        const id = setInterval(tick, 30000);
        return () => clearInterval(id);
    }, [phase, kickoff]);

    const hasScore = homeScore !== null && awayScore !== null;

    const settledPicks = picks.filter((p) => p.result !== 'pending');
    const net = settledPicks.reduce((sum, p) => {
        if (p.result === 'won') return sum + ((p.payout ?? p.potentialPayout) - p.stake);
        if (p.result === 'lost') return sum - p.stake;
        return sum;
    }, 0);

    return (
        <div>
            <div className="overflow-hidden rounded-lg border border-white/10 bg-ink-soft px-4 py-5 text-center">
                {phase === 'upcoming' && (
                    <>
                        <div className="mx-auto flex w-24 flex-col gap-1.5" aria-hidden>
                            <span className="h-1.5 animate-pulse rounded-full bg-white/10" />
                            <span className="h-1.5 w-2/3 animate-pulse rounded-full bg-white/10" style={{ animationDelay: '150ms' }} />
                        </div>
                        <p className="mt-3 text-sm font-semibold">Predictions are being set up</p>
                        <p className="mt-1 text-xs text-white/40">Markets open as soon as the fixture is confirmed. Check back shortly.</p>
                    </>
                )}

                {(phase === 'in_play' || phase === 'half_time') && (
                    <>
                        <div className="flex items-center justify-center gap-2">
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-floodlight opacity-75" />
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-floodlight" />
                            </span>
                            <span className="text-xs font-bold tracking-wide text-floodlight">{phase === 'half_time' ? 'HALF-TIME' : 'LIVE'}</span>
                        </div>

                        {hasScore && (
                            <>
                                <p className="mt-3 text-3xl font-bold tabular-nums">
                                    {homeScore} – {awayScore}
                                </p>
                                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-white/30">{isVirtual ? 'Live score' : 'Last recorded score'}</p>
                            </>
                        )}

                        <div className="relative mx-auto mt-4 h-8 max-w-xs overflow-hidden rounded-md bg-pitch/10" aria-hidden>
                            <span className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
                            <motion.span
                                className="absolute top-1/2 -mt-2.5 text-lg leading-none"
                                style={{ left: '4%' }}
                                animate={reduceMotion || phase === 'half_time' ? undefined : { left: ['4%', '88%', '4%'] }}
                                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                            >
                                ⚽
                            </motion.span>
                        </div>

                        <p className="mt-3 text-xs text-white/50">
                            {phase === 'half_time'
                                ? 'Second half is on its way. Predictions stay locked.'
                                : isVirtual && minute !== null
                                    ? `${minute}' played. Predictions are locked.`
                                    : elapsed !== null
                                        ? `Kicked off ${elapsed} min ago. Predictions are locked.`
                                        : 'Predictions are locked while the match is on.'}
                        </p>
                    </>
                )}

                {phase === 'awaiting_result' && (
                    <>
                        <div className="flex items-center justify-center gap-1.5" aria-hidden>
                            {[0, 150, 300].map((delay) => (
                                <span key={delay} className="h-2 w-2 animate-bounce rounded-full bg-pitch-light" style={{ animationDelay: `${delay}ms` }} />
                            ))}
                        </div>
                        <p className="mt-3 text-sm font-semibold">Waiting for the final result</p>
                        <p className="mt-1 text-xs text-white/40">Payouts land automatically as soon as it is confirmed.</p>
                    </>
                )}

                {phase === 'finished' && (
                    <>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-white/40">Full time</p>
                        {hasScore && (
                            <p className="mt-2 text-3xl font-bold tabular-nums">
                                {homeName} {homeScore} – {awayScore} {awayName}
                            </p>
                        )}
                        <p className="mt-2 text-xs text-white/40">
                            {picks.length === 0 ? 'Predictions are closed for this match.' : settledPicks.length === picks.length ? 'Results are in.' : 'Settling your picks now...'}
                        </p>
                    </>
                )}

                {phase === 'postponed' && (
                    <>
                        <p className="text-sm font-semibold">This match has been postponed</p>
                        <p className="mt-1 text-xs text-white/40">Predictions are on hold until it is rescheduled.</p>
                    </>
                )}

                {phase === 'cancelled' && <p className="text-sm font-semibold">This match was cancelled</p>}
            </div>

            {picks.length > 0 && (
                <div className="mt-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-display text-xs font-bold uppercase tracking-wide text-white/40">Your picks</h3>
                        {phase === 'finished' && settledPicks.length > 0 && (
                            <span className={`text-xs font-bold tabular-nums ${net > 0 ? 'text-pitch-light' : net < 0 ? 'text-red-400' : 'text-white/40'}`}>
                                {net > 0 ? '+' : ''}
                                {net} MP
                            </span>
                        )}
                    </div>
                    <div className="mt-2 flex flex-col gap-1.5">
                        {picks.map((pick) => (
                            <div key={pick.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3.5 py-2.5">
                                <div className="min-w-0">
                                    <p className="truncate text-xs text-white/50">{pick.question}</p>
                                    <p className="truncate text-sm font-semibold capitalize">{pick.answer}</p>
                                </div>
                                <div className="shrink-0 text-right text-xs">
                                    {pick.result === 'pending' && (
                                        <>
                                            <p className="font-semibold text-white/70">{pick.stake} MP</p>
                                            <p className="text-white/30">pays {pick.potentialPayout}</p>
                                        </>
                                    )}
                                    {pick.result === 'won' && <p className="font-bold text-pitch-light">+{pick.payout ?? pick.potentialPayout} MP</p>}
                                    {pick.result === 'lost' && <p className="font-bold text-red-400">-{pick.stake} MP</p>}
                                    {pick.result === 'void' && <p className="font-semibold text-white/40">Refunded</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}