'use client';
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { TeamBadge } from './TeamBadge';
import { EventTicker, type TickerEvent } from './EventTicker';
import { useSound } from '@/providers/SoundProvider';

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
  onNewEvent?: (event: TickerEvent, teamName: string) => void;
}

interface FloatingEmoji {
  id: number;
  emoji: string;
  leftOffset: number;
}

const REACTIONS = ['🔥', '😱', '⚽', '🧱', '🤬'];

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
  onNewEvent,
}: LiveMatchCardProps) {
  const [homeScore, setHomeScore] = useState(initialHomeScore);
  const [awayScore, setAwayScore] = useState(initialAwayScore);
  const [minute, setMinute] = useState(initialMinute);
  const [status, setStatus] = useState(initialStatus);
  const [events, setEvents] = useState(initialEvents);

  const [momentum, setMomentum] = useState(50);
  const { playPop, playGoal, playWhistle } = useSound();

  // Floating Emoji State
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const emojiIdCounter = useRef(0);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  useEffect(() => {
    if (status !== 'live') return;
    const interval = setInterval(() => {
      setMomentum((prev) => {
        if (prev > 50) return Math.max(50, prev - 2);
        if (prev < 50) return Math.min(50, prev + 2);
        return prev;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`virtual-match:${matchId}`, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'reaction' }, (payload) => {
        triggerEmoji(payload.payload.emoji);
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        (payload) => {
          const row = payload.new as { home_score: number | null; away_score: number | null; minute: number | null; status: string };
          if (row.home_score !== null) setHomeScore(row.home_score);
          if (row.away_score !== null) setAwayScore(row.away_score);
          if (row.minute !== null) setMinute(row.minute);
          if (row.status === 'full_time') {
            setStatus('full_time');
            playWhistle();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` },
        (payload) => {
          const row = payload.new as { id: string; type: string; minute: number; team_id: string };
          const isHome = row.team_id === home.id;
          const teamShortName = isHome ? home.shortName : away.shortName;
          const newEvent = { id: row.id, type: row.type, minute: row.minute, teamShortName };

          setEvents((prev) => [newEvent, ...prev]);
          if (onNewEvent) onNewEvent(newEvent, isHome ? home.name : away.name);

          if (row.type === 'goal') {
            playGoal();
            setMomentum(isHome ? 95 : 5);
          } else {
            playPop();
            const shift = isHome ? 25 : -25;
            setMomentum(prev => Math.max(10, Math.min(90, prev + shift)));
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, home, away, onNewEvent, playPop, playGoal, playWhistle]);

  const triggerEmoji = (emoji: string) => {
    const id = emojiIdCounter.current++;
    const leftOffset = Math.random() * 80 + 10; // Random position between 10% and 90%
    setFloatingEmojis((prev) => [...prev, { id, emoji, leftOffset }]);
    setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((e) => e.id !== id));
    }, 2000);
  };

  const sendReaction = (emoji: string) => {
    playPop();
    triggerEmoji(emoji); // Show it locally immediately
    channelRef.current?.send({
      type: 'broadcast',
      event: 'reaction',
      payload: { emoji },
    });
  };

  return (
    <div className="rounded-xl border border-white/10 bg-ink-soft p-5 overflow-hidden relative">
      <div
        className="absolute inset-0 opacity-10 transition-colors duration-700 pointer-events-none"
        style={{
          background: `linear-gradient(to right, ${home.primaryColor} 0%, transparent ${momentum}%, ${away.primaryColor} 100%)`
        }}
      />

      {/* Floating Emojis Layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        <AnimatePresence>
          {floatingEmojis.map((e) => (
            <motion.div
              key={e.id}
              initial={{ y: 200, opacity: 0, scale: 0.5 }}
              animate={{ y: 0, opacity: 1, scale: 1.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="absolute text-2xl"
              style={{ left: `${e.leftOffset}%`, bottom: '20%' }}
            >
              {e.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="relative z-10 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-floodlight">
          {status === 'live' ? (
            <>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-floodlight" />
              LIVE — {minute}&apos;
            </>
          ) : (
            <span className="text-white/40">FULL TIME</span>
          )}
        </span>
        <span className="text-xs text-white/30">Virtual match</span>
      </div>

      <div className="relative z-10 mt-4 flex items-center justify-center gap-6">
        <TeamColumn team={home} />
        <span className="font-display text-3xl font-bold tabular-nums drop-shadow-md">
          {homeScore} – {awayScore}
        </span>
        <TeamColumn team={away} />
      </div>

      {status === 'live' && (
        <div className="relative z-10 mt-6">
          <div className="relative h-1.5 w-full bg-black/40 rounded-full">
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
            <motion.div
              className="absolute top-1/2 -mt-2 h-4 w-4 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] border-2 border-ink flex items-center justify-center text-[8px]"
              animate={{ left: `calc(${momentum}% - 8px)` }}
              transition={{ type: 'spring', stiffness: 120, damping: 14 }}
            >⚽</motion.div>
          </div>
          <div className="flex justify-between text-[9px] uppercase tracking-widest text-white/30 mt-2 font-bold">
            <span className={momentum > 60 ? 'text-white/80' : ''}>{home.shortName} Pressure</span>
            <span className={momentum < 40 ? 'text-white/80' : ''}>{away.shortName} Pressure</span>
          </div>
        </div>
      )}

      {/* Reaction Bar */}
      {status === 'live' && (
        <div className="relative z-10 mt-5 flex justify-center gap-3 border-t border-white/10 pt-4">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => sendReaction(emoji)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-lg transition-transform hover:scale-110 hover:bg-white/10 active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {picks.length > 0 && (
        <div className="relative z-10 mt-5 flex flex-col gap-1.5 border-t border-white/10 pt-4">
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

      <div className="relative z-10 mt-5 border-t border-white/10 pt-4">
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