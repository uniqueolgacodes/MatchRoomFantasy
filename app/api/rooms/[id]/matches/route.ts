// Safely updates a room's matches by calling the update_room_matches RPC.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorResponse } from "@/lib/api/rpc-errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await req.json();
    const { matchIds } = body as { matchIds?: unknown };

    if (
      !Array.isArray(matchIds) ||
      matchIds.length === 0 ||
      matchIds.length > 20
    ) {
      return NextResponse.json(
        { error: "Select between 1 and 20 matches." },
        { status: 400 },
      );
    }
    if (!matchIds.every((id) => typeof id === "string" && UUID.test(id))) {
      return NextResponse.json(
        { error: "Invalid match selection." },
        { status: 400 },
      );
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { error } = await supabase.rpc("update_room_matches", {
      p_room_id: params.id,
      p_match_ids: matchIds,
    });

    if (error) return rpcErrorResponse(error);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
