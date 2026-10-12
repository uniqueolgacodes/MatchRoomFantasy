// One place for "turn on push for this browser". PushRegistration (the
// banner) and the settings page both call this, so OneSignal is only
// ever initialised once per page load.
import { createClient } from "@/lib/supabase/client";

type OneSignalInstance = (typeof import("react-onesignal"))["default"];

let initPromise: Promise<OneSignalInstance> | null = null;

async function getOneSignal(): Promise<OneSignalInstance> {
  if (!initPromise) {
    initPromise = (async () => {
      const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
      if (!appId) {
        throw new Error(
          "Missing NEXT_PUBLIC_ONESIGNAL_APP_ID in environment variables.",
        );
      }

      const OneSignal = (await import("react-onesignal")).default;
      await OneSignal.init({
        appId: appId,
        allowLocalhostAsSecureOrigin: true, // Required for local dev testing
        notifyButton: { enable: false },
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
// creating the subscription. This waits for the id to show up.
async function waitForSubscriptionId(
  OneSignal: OneSignalInstance,
  timeoutMs = 8000,
): Promise<string | null> {
  // In v16 API, opting in is sometimes required explicitly
  if (OneSignal.User.PushSubscription.optIn) {
    await OneSignal.User.PushSubscription.optIn();
  }

  const sub = OneSignal.User.PushSubscription as any;
  if (sub.id) return sub.id as string;

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>;

    const finish = (id: string | null) => {
      clearTimeout(timer);
      sub.removeEventListener("change", onChange);
      resolve(id);
    };

    const onChange = (event: any) => {
      const id = event?.current?.id ?? sub.id;
      if (id) finish(id);
    };

    timer = setTimeout(() => {
      console.warn("[Push] Timed out waiting for OneSignal Subscription ID.");
      finish(sub.id ?? null);
    }, timeoutMs);

    sub.addEventListener("change", onChange);
  });
}

export type EnablePushResult = "enabled" | "denied" | "unavailable";

export async function enablePush(userId: string): Promise<EnablePushResult> {
  try {
    const OneSignal = await getOneSignal();

    // Tie the current user's ID to this browser in OneSignal
    await OneSignal.login(userId);

    // Ask the browser for permission
    await OneSignal.Notifications.requestPermission();

    if (
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    ) {
      return "denied";
    }

    const playerId = await waitForSubscriptionId(OneSignal);
    if (!playerId) {
      console.error(
        "[Push] No Player ID returned. Ensure public/OneSignalSDKWorker.js exists and you don't have strict adblockers enabled.",
      );
      return "unavailable";
    }

    const supabase = createClient();

    // Safe DB update: check if it exists first
    const { data: existing } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("external_id", playerId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("push_subscriptions")
        .update({
          user_id: userId,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) {
        console.error("[Push] Database update failed:", error);
        return "unavailable";
      }
    } else {
      const { error } = await supabase.from("push_subscriptions").insert({
        user_id: userId,
        provider: "onesignal",
        external_id: playerId,
        user_agent: navigator.userAgent,
        last_used_at: new Date().toISOString(),
      });

      if (error) {
        console.error("[Push] Database insert failed:", error);
        return "unavailable";
      }
    }

    return "enabled";
  } catch (err) {
    console.error("[Push] Fatal setup error:", err);
    return "unavailable";
  }
}
