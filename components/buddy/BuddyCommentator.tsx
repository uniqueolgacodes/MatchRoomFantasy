'use client';
import { useEffect, useState } from 'react';
import { BuddyPreview } from './BuddyPreview';
import type { TickerEvent } from '../virtual/EventTicker';

interface BuddyCommentatorProps {
    latestEvent: { event: TickerEvent; teamName: string } | null;
}

export function BuddyCommentator({ latestEvent }: BuddyCommentatorProps) {
    const [speech, setSpeech] = useState<string>("Matches are underway! Let's see some action.");

    useEffect(() => {
        if (!latestEvent) return;

        const { type } = latestEvent.event;
        const team = latestEvent.teamName;

        const reactions: Record<string, string[]> = {
            goal: [`WHAT A GOAL BY ${team.toUpperCase()}! ⚽`, `${team} puts it in the back of the net!`, `Incredible finish from ${team}!`],
            near_miss: [`Ooh, so close for ${team}! 😬`, `Off the woodwork! ${team} almost had it.`],
            big_save: [`What a save against ${team}! 🧤`, `Keeper keeps it out!`],
            yellow_card: [`Yellow card for ${team}. Need to be careful. 🟨`],
            red_card: [`RED CARD! ${team} is down to 10 men! 🟥`, `Oh no, ${team} sees red!`],
            corner: [`Corner kick for ${team}. 🚩`, `${team} applying the pressure!`],
            var_check: [`VAR is stepping in... 📺`, `Hold on, checking VAR...`],
        };

        const options = reactions[type] || [`Big moment for ${team}.`];
        setSpeech(options[Math.floor(Math.random() * options.length)]);

        // Reset to idle chatter after a while
        const timer = setTimeout(() => setSpeech("Pacing back and forth..."), 8000);
        return () => clearTimeout(timer);
    }, [latestEvent]);

    return (
        <div className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-4 shadow-inner">
            <div className="shrink-0">
                <BuddyPreview size={56} />
            </div>
            <div className="flex-1 rounded-2xl rounded-tl-sm bg-white/10 px-4 py-3 text-sm font-medium text-white shadow-lg">
                {speech}
            </div>
        </div>
    );
}