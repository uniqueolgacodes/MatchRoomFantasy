// OneSignal push delivery. PRD v5 §23.3.
// Called internally by settle-predictions (MP award notifications)
// and by a scheduled kickoff-reminder function, not invoked directly
// by clients.

import { Sentry } from '../_shared/clients.ts';

const ONESIGNAL_API_KEY = Deno.env.get('ONESIGNAL_API_KEY')!;
const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID')!;

Deno.serve(async (req) => {
  try {
    const { external_ids, title, body, data } = await req.json();
    if (!Array.isArray(external_ids) || external_ids.length === 0) {
      return Response.json({ ok: true, sent: 0 });
    }

    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_player_ids: external_ids,
        headings: { en: title },
        contents: { en: body },
        data: data ?? {},
      }),
    });

    if (!res.ok) throw new Error(`OneSignal ${res.status}`);
    return Response.json({ ok: true, sent: external_ids.length });
  } catch (err) {
    Sentry.captureException(err);
    return new Response('send-push failed', { status: 500 });
  }
});
