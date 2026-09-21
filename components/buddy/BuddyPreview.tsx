'use client';
// A lightweight preview of Buddy (PRD §19 Buddy AI System) used only
// to introduce the character during onboarding. This is NOT the
// full Buddy AI system (useBuddyBrain, speech banks, match-event
// reactions) — those come later per the PRD build phases (§33,
// Phase 6). This is deliberately a plain, small face: two eyes that
// glance left, then right, then settle back on the person with a
// smile, on a loop — no gradient shine, no blinking, nothing busy.
//
// 'use client' — cycling the speech bubble text needs a timer.
import { useEffect, useState } from 'react';

interface BuddyPreviewProps {
  /** One line, or several to cycle through in the speech bubble. Omit to render Buddy alone. */
  speech?: string | string[];
  /** How long each line shows before cycling to the next, in ms. */
  cycleMs?: number;
  /** Visual size in pixels. Defaults to 80. */
  size?: number;
  className?: string;
}

export function BuddyPreview({ speech, cycleMs = 3400, size = 80, className = '' }: BuddyPreviewProps) {
  const lines = Array.isArray(speech) ? speech : speech ? [speech] : [];
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    if (lines.length < 2) return;
    const interval = setInterval(() => {
      setLineIndex((i) => (i + 1) % lines.length);
    }, cycleMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length, cycleMs]);

  const currentLine = lines[lineIndex % lines.length];

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {currentLine && (
        <div
          key={lineIndex}
          className="animate-speech-pop relative mb-3 max-w-[240px] rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 text-center text-sm font-medium text-ink shadow-lg shadow-black/20"
        >
          {currentLine}
        </div>
      )}
      <div className="animate-buddy-float" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="Buddy, your MatchRoom companion">
          {/* Plain body — flat fill, no gradient/shine, keeps the
              face itself the focal point. */}
          <circle cx="60" cy="60" r="46" fill="#16a34a" />

          {/* Eyes: white sclera stays put, the pupil group glances
              left then right then returns to center, on a loop. */}
          <circle cx="44" cy="56" r="9" fill="white" />
          <circle cx="76" cy="56" r="9" fill="white" />
          <g className="animate-buddy-look">
            <circle cx="45" cy="57" r="4" fill="#0a0a0a" />
            <circle cx="77" cy="57" r="4" fill="#0a0a0a" />
          </g>

          {/* Mouth: a steady smile that widens slightly right as the
              eyes settle back on the viewer, each loop. */}
          <path
            d="M48 76 Q60 86 72 76"
            stroke="#0a0a0a"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
            className="animate-buddy-smile"
          />
        </svg>
      </div>
    </div>
  );
}
