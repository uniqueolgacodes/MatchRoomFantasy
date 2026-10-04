// Landing page for logged-out visitors. Deliberately a server
// component with no 'use client' — the whole page ships as static
// HTML with zero JavaScript bundle, which matters more here than on
// any other route since this is the page every new visitor loads
// cold, often over a slow connection.
//
// Rewritten: the original version was built entirely around "your
// WhatsApp group" as the headline identity, with zero mention of
// Virtual Matches, World Rankings, or Team Hub — all genuinely
// substantial parts of the product by now. Every section is still
// grounded in a real, specific mechanic (the checkpoint model,
// share-anywhere room links, the always-on virtual match engine, the
// no-cash MP system) rather than generic SaaS trust badges.

export function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* A single static glow standing in for stadium floodlights —
          pure CSS, no image, no animation cost. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-0 h-[560px] w-[560px] rounded-full opacity-[0.12] blur-3xl"
        style={{ background: 'radial-gradient(circle, #eab308 0%, transparent 70%)' }}
      />

      <Hero />
      <HowItWorks />
      <VirtualMatches />
      <ShareAnywhere />
      <CompeteEverywhere />
      <NoCash />
      <FinalCTA />
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-6 pb-20 pt-16 lg:grid-cols-2 lg:pt-24">
      <div className="animate-rise-in">
        <h1 className="font-display text-4xl font-bold leading-[1.1] text-chalk sm:text-5xl">
          Football predictions that never go quiet
        </h1>
        <p className="mt-5 max-w-md text-lg text-white/60">
          Join a room for the real Premier League, or jump into a Virtual match kicking off
          right now. Pick winners, scores, cards — settle it with Match Points, not naira.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <a
            href="/login"
            className="rounded-lg bg-pitch px-6 py-3 font-semibold text-white transition-colors hover:bg-pitch-dark"
          >
            Create your room
          </a>
          <a
            href="#how-it-works"
            className="px-2 py-3 text-sm font-medium text-white/60 transition-colors hover:text-white"
          >
            See how it works
          </a>
        </div>
        <p className="mt-8 text-sm text-white/40">
          Free to play. No app to download. No cash ever changes hands.
        </p>
      </div>

      <RoomCardMock />
    </section>
  );
}

// The hero's proof-of-product: a mock of an actual Room mid-match,
// showing the half-time checkpoint mechanic specifically — this is
// the one thing genuinely unique to how real-match rooms work, so
// it's what earns the hero's visual real estate rather than an
// abstract shape. Virtual Matches get their own proof point below.
function RoomCardMock() {
  return (
    <div className="animate-rise-in [animation-delay:150ms]">
      <div className="rounded-2xl border border-white/10 bg-ink-soft p-6 shadow-2xl shadow-black/40 transition-transform duration-300 hover:-translate-y-1">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <span className="text-sm text-white/50">Saturday Squad</span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-floodlight">
            <span className="h-1.5 w-1.5 rounded-full bg-floodlight" />
            Half-time
          </span>
        </div>

        <div className="flex items-center justify-between py-6">
          <TeamLine name="Arsenal" />
          <span className="font-display text-3xl font-bold text-chalk">1–0</span>
          <TeamLine name="Chelsea" align="right" />
        </div>

        <div className="space-y-2 border-t border-white/10 pt-4">
          <p className="text-xs uppercase tracking-normal text-white/40">Second-half markets, just opened</p>
          <PredictionRow label="Second-half winner" answer="Arsenal" count={4} />
          <PredictionRow label="Comeback for Chelsea" answer="No" count={2} />
        </div>
      </div>
    </div>
  );
}

function TeamLine({ name, align = 'left' }: { name: string; align?: 'left' | 'right' }) {
  return (
    <div className={`flex flex-col ${align === 'right' ? 'items-end text-right' : 'items-start'}`}>
      <span className="text-sm font-medium text-white/80">{name}</span>
    </div>
  );
}

function PredictionRow({ label, answer, count }: { label: string; answer: string; count: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5">
      <span className="text-sm text-white/70">{label}</span>
      <span className="text-sm font-medium text-pitch-light">
        {answer} <span className="text-white/30">· {count} predicted</span>
      </span>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: '1',
      title: 'Join a room',
      body: 'Tap a share link or type a 6-character code. No app store, no signup form standing between you and kickoff.',
    },
    {
      n: '2',
      title: 'Call it before kickoff',
      body: 'Pick the winner, the scoreline, who gets booked. Predictions lock the moment the ref blows the first whistle.',
    },
    {
      n: '3',
      title: 'Settle at the whistle',
      body: 'Half-time and full-time scores lock in automatically, and Match Points land in your balance within minutes of the final whistle.',
    },
  ];

  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="font-display text-3xl font-bold text-chalk">How MatchRoom works</h2>
      <div className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-3">
        {steps.map((step) => (
          <div key={step.n}>
            <span className="font-display text-sm font-bold text-pitch">{step.n}</span>
            <h3 className="mt-3 font-display text-xl font-bold text-chalk">{step.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-white/55">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// New section. Virtual Matches are genuinely the most differentiated
// thing this product does by now — nothing else runs round-the-clock
// predictable football — and the original landing page never
// mentioned them at all.
function VirtualMatches() {
  return (
    <section className="border-t border-white/10">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-floodlight">Virtual Matches</span>
          <h2 className="font-display mt-2 text-3xl font-bold text-chalk">No fixtures today? Doesn't matter.</h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/55">
            Ten-minute matches between our own fictional clubs, a fresh kickoff every few
            minutes, round the clock. Same Match Points, same bragging rights — settled before
            you've finished your tea, with nothing to wait for.
          </p>
        </div>

        <VirtualMatchMock />
      </div>
    </section>
  );
}

// Grounded in the real /virtual UI — team badges built from each
// club's own colors (no crest image needed, since these clubs are
// fictional), a live minute count, and a couple of ticker events —
// the same proof-not-decoration treatment as the real-match Room
// card above.
function VirtualMatchMock() {
  return (
    <div className="rounded-2xl border border-white/10 bg-ink-soft p-6 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-floodlight">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-floodlight" />
          LIVE — 7'
        </span>
        <span className="text-xs text-white/30">Virtual match</span>
      </div>

      <div className="flex items-center justify-center gap-6 py-6">
        <VirtualTeam shortName="IRO" color="#4b5563" />
        <span className="font-display text-2xl font-bold text-chalk">1 – 0</span>
        <VirtualTeam shortName="SOL" color="#f59e0b" />
      </div>

      <div className="space-y-1.5 border-t border-white/10 pt-4">
        <TickerRow emoji="⚽" label="GOAL!" minute={4} team="IRO" highlight />
        <TickerRow emoji="🟨" label="Yellow card" minute={6} team="SOL" />
      </div>
    </div>
  );
}

function VirtualTeam({ shortName, color }: { shortName: string; color: string }) {
  return (
    <span
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-xs font-bold text-white"
      style={{ backgroundColor: color }}
    >
      {shortName}
    </span>
  );
}

function TickerRow({ emoji, label, minute, team, highlight }: { emoji: string; label: string; minute: number; team: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${highlight ? 'bg-pitch/10 font-semibold text-pitch-light' : 'bg-white/[0.03] text-white/70'}`}>
      <span className="text-base leading-none">{emoji}</span>
      <span className="w-6 shrink-0 tabular-nums text-white/40">{minute}'</span>
      <span className="flex-1">{label}</span>
      <span className="shrink-0 text-xs text-white/40">{team}</span>
    </div>
  );
}

function ShareAnywhere() {
  return (
    <section className="border-t border-white/10">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-2">
        <ChatMock />
        <div>
          <h2 className="font-display text-3xl font-bold text-chalk">
            One link, shared wherever you want
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/55">
            There's nothing to download and no account to approve before someone can join. Drop
            the link in WhatsApp, post it on Twitter, text it, paste it in Discord — wherever
            your people actually are, that's where the room lives too.
          </p>
        </div>
      </div>
    </section>
  );
}

// A restrained chat-bubble mock — illustrates the share-a-link
// mechanic concretely with one example thread, not a claim that this
// only works in one specific app.
function ChatMock() {
  return (
    <div className="rounded-2xl border border-white/10 bg-ink-soft p-5">
      <div className="space-y-3">
        <Bubble from="Tunde">who's got Arsenal today</Bubble>
        <Bubble from="Kemi">joining the room now</Bubble>
        <Bubble from="You" mine>
          matchroom.app/r/saturday-squad
        </Bubble>
        <Bubble from="Tunde">🔒'd in</Bubble>
      </div>
    </div>
  );
}

function Bubble({ from, mine, children }: { from: string; mine?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      <span className="mb-1 px-1 text-xs text-white/35">{from}</span>
      <span
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${mine ? 'rounded-tr-sm bg-pitch text-white' : 'rounded-tl-sm bg-white/[0.06] text-white/80'
          }`}
      >
        {children}
      </span>
    </div>
  );
}

// New, lighter-weight section — three things worth competing at,
// without the heavier illustrated treatment the two feature sections
// above get. Keeps the page from feeling like an undifferentiated
// feature grid by not giving every single feature equal visual
// weight.
function CompeteEverywhere() {
  const items = [
    { title: 'Room leaderboards', body: 'Every room tracks its own table — settle the group chat argument with numbers.' },
    { title: 'World Rankings', body: 'One global table, every player, every season. Top 100 gets bragging rights that actually count.' },
    { title: 'Follow your club', body: "Next match, recent form, news — all in one place for the team you actually care about." },
  ];

  return (
    <section className="border-t border-white/10">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-3xl font-bold text-chalk">Climb every table</h2>
        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.title}>
              <h3 className="font-display text-base font-bold text-chalk">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NoCash() {
  const points = [
    { title: 'Free to play', body: 'No entry fee, no subscription, no paywall between you and a room.' },
    { title: 'Match Points aren\u2019t money', body: 'Never bought, never cashed out. They only ever move between players.' },
    { title: 'Real rewards, still no cash', body: 'Badges, trophies, and the occasional sponsored prize \u2014 never a payout.' },
  ];

  return (
    <section className="border-t border-white/10">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-3xl font-bold text-chalk">No cash, ever</h2>
        <p className="mt-3 max-w-lg text-[15px] text-white/55">
          MatchRoom is built for bragging rights, not betting slips — that's a rule, not a
          slogan.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {points.map((point) => (
            <div key={point.title} className="rounded-xl border border-white/10 p-5">
              <h3 className="font-display text-base font-bold text-chalk">{point.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{point.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="border-t border-white/10">
      <div className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h2 className="font-display text-3xl font-bold text-chalk sm:text-4xl">
          There's a match kicking off right now
        </h2>
        <a
          href="/login"
          className="mt-8 inline-block rounded-lg bg-pitch px-8 py-3.5 font-semibold text-white transition-colors hover:bg-pitch-dark"
        >
          Create your room
        </a>
      </div>
    </section>
  );
}
