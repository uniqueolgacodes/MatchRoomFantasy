// One-off/manual team-crest sync. poll-fixtures already self-heals
// this automatically the next time it runs (see its comment), but
// this exists so you can trigger it directly — from the Supabase
// dashboard's "Invoke" button, or a raw POST via curl — without
// waiting for the next 6-hourly poll, or on a slow weekly cron as a
// safety net.
import { Sentry } from '../_shared/clients.ts';
import { syncTeamCrests } from '../_shared/teams.ts';

Deno.serve(async () => {
  try {
    const result = await syncTeamCrests();
    console.log('[sync-teams] done.', result);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error('[sync-teams] fatal error:', err);
    Sentry.captureException(err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
});
