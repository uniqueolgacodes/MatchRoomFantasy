// One place for "turn on push for this browser". PushRegistration (the
// banner) and the settings page both call this, so OneSignal is only
// ever initialised once per page load — calling init() twice makes the
// SDK complain — and the "wait for the subscription id" fix below
// applies to both.
import { createClient } from "@/lib/supabase/client";

type OneSignalInstance = (typeof import("react-onesignal"))["default"];

let initPromise: Promise<OneSignalInstance> | null = null;

async function getOneSignal(): Promise<OneSignalInstance> {
  if (!initPromise) {
    initPromise = (async () => {
      const OneSignal = (await import("react-onesignal")).default;
      await OneSignal.init({
        appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID!,
      });
      return OneSignal;
    })().catch((err) => {
      initPromise = null; // let a later attempt retry instead of caching the failure
      throw err;
    });
  }
  return initPromise;
}

// requestPermission() can resolve before OneSignal has finished
// creating the subscription, so PushSubscription.id may still be
// empty right after it. The Phase A code read it immediately and
// silently saved nothing when it was empty, which would leave a
// device that said yes but was never registered. This waits for the
// id to show up, up to a timeout.
async function waitForSubscriptionId(
  OneSignal: OneSignalInstance,
  timeoutMs = 8000,
): Promise<string | null> {
  const sub = OneSignal.User.PushSubscription as any;
  if (sub.id) return sub.id as string;

  return new Promise((resolve) => {
    const finish = (id: string | null) => {
      clearTimeout(timer);
      sub.removeEventListener("change", onChange);
      resolve(id);
    };
    const onChange = (event: any) => {
      const id = event?.current?.id ?? sub.id;
      if (id) finish(id);
    };
    const timer = setTimeout(() => finish(sub.id ?? null), timeoutMs);
    sub.addEventListener("change", onChange);
  });
}

export type EnablePushResult = "enabled" | "denied" | "unavailable";

export async function enablePush(userId: string): Promise<EnablePushResult> {
  try {
    const OneSignal = await getOneSignal();
    await OneSignal.Notifications.requestPermission();

    if (
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    )
      return "denied";

    const playerId = await waitForSubscriptionId(OneSignal);
    if (!playerId) return "unavailable";

    const supabase = createClient();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        provider: "onesignal",
        external_id: playerId,
        user_agent: navigator.userAgent,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider,external_id" },
    );
    return error ? "unavailable" : "enabled";
  } catch {
    return "unavailable";
  }
}
