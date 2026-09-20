# MatchRoom Fantasy

Free, WhatsApp-native matchday prediction rooms for Nigerian EPL fans.
No cash entry, no cash-out — Match Points (MP) only.

This is a scaffold generated from the project's technical documentation
(v5, "Consolidated"). It sets up the directory structure, database
schema, edge functions, and a minimal app shell so you can start
filling in features in the order laid out in the Build Phases section
of the doc. Most page components are placeholders — the schema and
the settlement engine are the parts built out in full, since those
are the pieces that are easy to get subtly wrong.

## What's actually implemented vs. scaffolded

**Implemented (real logic, matches the corrected PRD):**

- Full database schema + RLS baseline (`supabase/migrations/`)
- The three-checkpoint live data pipeline (`poll-fixtures`,
  `poll-half-time-snapshots`, `poll-full-time-snapshots`)
- The settlement engine (`settle-predictions`, `settle-room-match`,
  `score-gameweek`) with the idempotency lock pattern and the
  chained (not parallel) settlement ordering
- The budget guard, auth middleware, room-join and stake-placement
  API routes

**Scaffolded only (folder + a placeholder page/comment, no real UI):**

- Buddy AI, animations, sound system
- Room chat, leaderboards, trophy room, fantasy team builder
- Most page components under `app/(main)/`

Build in the order Section 33 (Build Phases) lays out: the pipeline
and settlement engine first (already done here), then predictions
end-to-end, then leaderboards, then the retention/personality layer.

## Prerequisites

- [Node.js](https://nodejs.org) 20 or later
- [VS Code](https://code.visualstudio.com)
- [Supabase CLI](https://supabase.com/docs/guides/cli) — `npm install -g supabase`
- A free [Supabase](https://supabase.com) project
- Free-tier accounts for: [API-Football](https://www.api-football.com/) (api-sports.io),
  [football-data.org](https://www.football-data.org/), [Upstash](https://upstash.com/) (Redis),
  [Sentry](https://sentry.io/), [OneSignal](https://onesignal.com/), [Resend](https://resend.com/)
  — you don't need all of these on day one; the app runs without
  them, individual features just won't do anything until their key
  is set.

## Setup

### 1. Unzip and open in VS Code

```bash
unzip matchroom-fantasy.zip
cd matchroom-fantasy
code .
```

When VS Code opens, it will prompt you to install the recommended
extensions (`.vscode/extensions.json`) — accept that, it includes
Tailwind IntelliSense and the Supabase extension which both help a
lot here.

### 2. Install dependencies

In the VS Code integrated terminal (`` Ctrl+` `` / `` Cmd+` ``):

```bash
npm install
```

### 3. Set up Supabase

```bash
supabase login
supabase init          # if it asks to overwrite supabase/config.toml, say no — one is already here
supabase link --project-ref rmkpadixdmmbczmmulwn
supabase db push        # runs the three migrations in supabase/migrations/
```

Your project ref and API keys are on your Supabase project's
Settings → API page.

### 4. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` with your Supabase URL/keys at minimum. Everything
else can stay blank until you're building the feature that needs it.

### 5. Deploy the Edge Functions

```bash
supabase functions deploy poll-fixtures
supabase functions deploy poll-half-time-snapshots
supabase functions deploy poll-full-time-snapshots
supabase functions deploy settle-predictions
supabase functions deploy settle-room-match
supabase functions deploy score-gameweek
supabase functions deploy send-push
supabase functions deploy spin-revival
supabase functions deploy ingest-news
```

Then set their secrets (same values as `.env.local`, but on the
Supabase side — Edge Functions don't read `.env.local`):

```bash
supabase secrets set API_FOOTBALL_KEY=xxx
supabase secrets set FOOTBALL_DATA_KEY=xxx
supabase secrets set UPSTASH_REDIS_URL=xxx
supabase secrets set UPSTASH_REDIS_TOKEN=xxx
supabase secrets set SENTRY_DSN=xxx
supabase secrets set ONESIGNAL_APP_ID=xxx
supabase secrets set ONESIGNAL_API_KEY=xxx
```

### 6. Cron setup

`supabase/migrations/0003_cron.sql` schedules the checkpoint pollers
and housekeeping jobs, but the `net.http_post` calls inside them read
two Postgres settings that aren't set by a migration — they need to
be configured once per environment:

```sql
-- Run this in the Supabase SQL Editor (or via `supabase db execute`)
alter database postgres set app.settings.functions_url = 'https://<your-project-ref>.supabase.co/functions/v1';
alter database postgres set app.settings.service_role_key = '<your-service-role-key>';
```

Without this, the cron jobs will fire but the HTTP calls inside them
will fail — check Database → Cron in the Supabase dashboard if
snapshots aren't appearing.

### 7. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
app/                  Next.js App Router pages
  (auth)/             Login/signup — outside the main layout
  (main)/             Everything behind auth — rooms, selections, etc.
  api/                Route handlers (join-by-code, stake, etc.)
components/           UI components, organized by feature area
hooks/                Client-side hooks
lib/                  Supabase clients, points logic, utilities
providers/            React context providers (Auth, Room, Buddy)
supabase/
  functions/          Edge Functions (Deno) — the pipeline + settlement engine
  migrations/         SQL migrations — schema, RLS, cron
types/                Generated Supabase types (run the gen command below)
```

## Generating real TypeScript types

`types/index.ts` currently exports `any` as a placeholder. Once your
schema is pushed, generate real types:

```bash
supabase gen types typescript --local > types/index.ts
```

Re-run this after any migration that changes the schema.

## A few things worth knowing before you build on this

- **RLS policies are a starting baseline, not a final policy set**
  (`supabase/migrations/0002_rls.sql`) — they weren't spelled out in
  the PRD in detail, so these are reasonable defaults (read-your-own,
  read-your-room). Review them before relying on them for anything
  sensitive.
- **Prediction resolution rules** are evaluated in
  `supabase/functions/settle-predictions/index.ts`'s
  `evaluateResolutionRule` function — it currently covers the 8
  pre-match + 5 half-time markets from the PRD. Add a new market by
  adding a case there and matching `resolution_rule.type` when you
  create the `predictions` row.
- **The fantasy scoring function** (`score-gameweek`) has a
  simplified "assumes 60+ minutes played" line — the real version
  needs per-player minutes-played data, which isn't in the checkpoint
  snapshots as designed. Worth deciding whether that's worth an extra
  API call or a v2 feature.
- **`npm run typecheck`** will show errors until you run `npm install`
  and generate real types — that's expected for a fresh scaffold.

## Regulatory note

Per the PRD's Decisions Log and §14.3: the `sponsored_prize`
redemption category is the specific regulatory pressure point (MP
converting to real-world goods). Get a legal read on that specific
mechanic before this goes beyond friends and family — see the
Appendices for the fuller open question.
