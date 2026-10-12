// PRD §10.4 Room Codes — join flow.
//
// Joining goes through join_room_by_code() (migration 0009): it looks up the
// room by code (private rooms included), enforces capacity and bans, and
// inserts the membership. Clients can no longer write room_members directly.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorResponse } from "@/lib/api/rpc-errors";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const code = (body as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || code.trim() === "" || code.length > 12) {
    return NextResponse.json(
      { error: "Enter a valid room code." },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase.rpc("join_room_by_code", {
    p_code: code,
  });
  if (error) return rpcErrorResponse(error);

  // --- SEND ROOM JOIN NOTIFICATIONS ---
  if (data && !data.already_member) {
    try {
      const { data: roomData } = await supabase
        .from("rooms")
        .select("owner_id, name")
        .eq("id", data.id)
        .single();
      if (roomData?.owner_id && roomData.owner_id !== user.id) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();
        const joinerName = profileData?.username || "Someone";

        await supabase.from("notifications").insert({
          user_id: roomData.owner_id,
          type: "room_activity",
          title: "New Room Member 👀",
          body: `${joinerName} just joined ${roomData.name}.`,
          deep_link: `/rooms/${data.id}`,
        });

        // Use invoke so it safely passes the current user's session context automatically
        await supabase.functions.invoke("send-push", {
          body: {
            type: "room_activity",
            notifications: [
              {
                user_id: roomData.owner_id,
                title: "New Squad Member 👀",
                body: `${joinerName} just joined ${roomData.name}.`,
                data: { room_id: data.id },
              },
            ],
          },
        });
      }
    } catch (e) {
      console.error("Failed to process room join notification", e);
    }
  }
  // ------------------------------------

  // data = { id, slug, name, room_type, already_member }
  return NextResponse.json({ room: data });
}
