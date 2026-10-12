// OneSignal push delivery + Smart Dispatcher. PRD v5 §23.3.
// Centralizes preference evaluation and quiet hours.
import { supabase, Sentry } from "../_shared/clients.ts";

const ONESIGNAL_API_KEY = Deno.env.get("ONESIGNAL_API_KEY")!;
const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID")!;

interface PushRequest {
  type: "win" | "reminder" | "room_activity" | "system";
  notifications: {
    user_id: string;
    title: string;
    body: string;
    data?: Record<string, any>;
  }[];
}

function isQuietHours(
  startStr: string | null,
  endStr: string | null,
  timezone: string | null,
): boolean {
  if (!startStr || !endStr || !timezone) return false;
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")!.value, 10);

    const currentMins = hour * 60 + minute;

    const [sh, sm] = startStr.split(":").map(Number);
    const startMins = sh * 60 + (sm || 0);

    const [eh, em] = endStr.split(":").map(Number);
    const endMins = eh * 60 + (em || 0);

    if (startMins < endMins) {
      return currentMins >= startMins && currentMins < endMins;
    } else {
      // Crosses midnight (e.g. 22:00 to 07:00)
      return currentMins >= startMins || currentMins < endMins;
    }
  } catch (e) {
    console.error("Quiet hours parse error", e);
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    const payload: PushRequest = await req.json();
    const { type, notifications } = payload;

    if (!notifications || notifications.length === 0) {
      return Response.json({ ok: true, sent: 0, skipped: 0 });
    }

    const userIds = [...new Set(notifications.map((n) => n.user_id))];

    // Fetch profiles for preferences
    const { data: profiles } = await supabase
      .from("profiles")
      .select(
        "id, notify_push_enabled, notify_kickoff, notify_room_activity, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone",
      )
      .in("id", userIds);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    // Fetch device subscriptions
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("user_id, external_id")
      .in("user_id", userIds);

    const subMap = new Map<string, string[]>();
    for (const s of subs || []) {
      const arr = subMap.get(s.user_id) || [];
      arr.push(s.external_id);
      subMap.set(s.user_id, arr);
    }

    const toSend = [];
    let skipped = 0;

    for (const n of notifications) {
      const p = profileMap.get(n.user_id);
      if (!p) {
        skipped++;
        continue;
      }

      // 1. Global push toggle
      if (p.notify_push_enabled === false) {
        skipped++;
        continue;
      }

      // 2. Type-specific toggles
      if (type === "reminder" && p.notify_kickoff === false) {
        skipped++;
        continue;
      }
      if (type === "room_activity" && p.notify_room_activity === false) {
        skipped++;
        continue;
      }

      // 3. Quiet hours
      if (
        p.quiet_hours_enabled &&
        isQuietHours(p.quiet_hours_start, p.quiet_hours_end, p.timezone)
      ) {
        skipped++;
        continue;
      }

      // 4. Has registered device?
      const devices = subMap.get(n.user_id);
      if (!devices || devices.length === 0) {
        skipped++;
        continue;
      }

      toSend.push({
        app_id: ONESIGNAL_APP_ID,
        include_player_ids: devices,
        headings: { en: n.title },
        contents: { en: n.body },
        data: n.data ?? {},
      });
    }

    if (toSend.length === 0) {
      return Response.json({ ok: true, sent: 0, skipped });
    }

    // Fire off to OneSignal
    let sentCount = 0;
    await Promise.all(
      toSend.map(async (msg) => {
        const res = await fetch("https://onesignal.com/api/v1/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${ONESIGNAL_API_KEY}`,
          },
          body: JSON.stringify(msg),
        });
        if (res.ok) sentCount += msg.include_player_ids.length;
        else console.error("OneSignal error", await res.text());
      }),
    );

    return Response.json({ ok: true, sent: sentCount, skipped });
  } catch (err) {
    Sentry.captureException(err);
    return new Response("send-push failed", { status: 500 });
  }
});
