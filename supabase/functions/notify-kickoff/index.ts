// Kickoff Reminder Poller. Runs every 5 minutes.
// Scans for matches kicking off in exactly 15-20 minutes and alerts
// room members who haven't placed a prediction.

import { supabase, Sentry } from "../_shared/clients.ts";

Deno.serve(async () => {
  try {
    const now = Date.now();
    // 15 to 20 minute window matches a 5 min cron cleanly without overlap
    const startWindow = new Date(now + 15 * 60000).toISOString();
    const endWindow = new Date(now + 20 * 60000).toISOString();

    // 1. Find upcoming matches in window
    const { data: matches } = await supabase
      .from("matches")
      .select("id, home_team_id, away_team_id, kickoff, is_virtual")
      .gte("kickoff", startWindow)
      .lte("kickoff", endWindow)
      .eq("status", "scheduled");

    if (!matches || matches.length === 0) {
      return Response.json({ ok: true, sent: 0, msg: "No matches in window" });
    }

    const teamIds = [
      ...new Set(matches.flatMap((m) => [m.home_team_id, m.away_team_id])),
    ];
    const { data: teams } = await supabase
      .from("teams")
      .select("id, short_name")
      .in("id", teamIds);
    const teamMap = new Map((teams || []).map((t) => [t.id, t.short_name]));

    let notificationsSent = 0;

    for (const match of matches) {
      // Find all users in rooms linked to this match
      const { data: roomMatches } = await supabase
        .from("room_matches")
        .select("room_id")
        .eq("match_id", match.id);
      if (!roomMatches || roomMatches.length === 0) continue;

      const roomIds = roomMatches.map((rm) => rm.room_id);
      const { data: members } = await supabase
        .from("room_members")
        .select("user_id")
        .in("room_id", roomIds);
      if (!members || members.length === 0) continue;

      const userIds = [...new Set(members.map((m) => m.user_id))];

      // Filter out users who already predicted for this match
      const { data: matchPredictions } = await supabase
        .from("predictions")
        .select("id")
        .eq("match_id", match.id);
      const predIds = (matchPredictions || []).map((p) => p.id);

      let predictedUserIds = new Set();
      if (predIds.length > 0) {
        const { data: userStakes } = await supabase
          .from("prediction_stakes")
          .select("user_id")
          .in("prediction_id", predIds)
          .in("user_id", userIds);
        predictedUserIds = new Set((userStakes || []).map((s) => s.user_id));
      }

      const targetUsers = userIds.filter((uid) => !predictedUserIds.has(uid));
      if (targetUsers.length === 0) continue;

      const homeName = teamMap.get(match.home_team_id) || "Home";
      const awayName = teamMap.get(match.away_team_id) || "Away";
      const title = `Kickoff approaching! ⏰`;
      const body = `${homeName} vs ${awayName} starts in 15 minutes. Lock in your predictions!`;

      // Insert into notifications for the Bell UI
      await supabase.from("notifications").insert(
        targetUsers.map((uid) => ({
          user_id: uid,
          type: "reminder",
          title,
          body,
          deep_link: `/match/${match.id}`,
        })),
      );

      // Dispatch Push
      const pushPayload = {
        type: "reminder",
        notifications: targetUsers.map((uid) => ({
          user_id: uid,
          title,
          body,
          data: { match_id: match.id },
        })),
      };

      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify(pushPayload),
      });

      notificationsSent += targetUsers.length;
    }

    return Response.json({ ok: true, sent: notificationsSent });
  } catch (err) {
    Sentry.captureException(err);
    return new Response("notify-kickoff failed", { status: 500 });
  }
});
