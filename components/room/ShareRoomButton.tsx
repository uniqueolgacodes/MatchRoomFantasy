'use client';
// PRD §10.4 Room Codes & Invite Links — every room is shareable via a
// WhatsApp link. Built client-side so it can read window.location
// rather than depending on an env var matching the actual deployed
// origin.
import { useState } from 'react';

export function ShareRoomButton({ slug, name, code }: { slug: string; name: string; code: string }) {
  const [copied, setCopied] = useState(false);

  function getLink() {
    return `${window.location.origin}/r/${slug}`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(getLink());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. non-HTTPS) — the code is still shown below as a fallback.
    }
  }

  function whatsAppShare() {
    const text = `Join my MatchRoom "${name}"! ${getLink()} (code: ${code})`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={copyLink}
        className="flex-1 rounded-lg bg-ink-soft px-3.5 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.07]"
      >
        {copied ? 'Copied!' : `Code: ${code}`}
      </button>
      <button
        onClick={whatsAppShare}
        className="rounded-lg bg-pitch px-3.5 py-2.5 text-sm font-semibold transition-colors hover:bg-pitch-dark"
      >
        Share
      </button>
    </div>
  );
}
