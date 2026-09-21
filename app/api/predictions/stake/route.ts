// PRD §15 — place a prediction stake.
//
// All validation (market open, answer is a real option, room membership,
// balance, one-stake-per-context) and the MP debit + stake insert happen in
// ONE database transaction inside place_prediction_stake() (migration 0009).
// This route only authenticates, sanity-checks the payload and maps errors.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rpcErrorResponse } from '@/lib/api/rpc-errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { predictionId, answer, stake, roomId } = (body ?? {}) as {
    predictionId?: unknown; answer?: unknown; stake?: unknown; roomId?: unknown;
  };

  if (typeof predictionId !== 'string' || !UUID.test(predictionId)) {
    return NextResponse.json({ error: 'Invalid prediction.' }, { status: 400 });
  }
  if (typeof answer !== 'string' || answer.trim() === '' || answer.length > 100) {
    return NextResponse.json({ error: 'Invalid answer.' }, { status: 400 });
  }
  if (typeof stake !== 'number' || !Number.isFinite(stake)) {
    return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 });
  }
  if (roomId != null && (typeof roomId !== 'string' || !UUID.test(roomId))) {
    return NextResponse.json({ error: 'Invalid room.' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // The DB clamps to [POINTS.MIN_STAKE, POINTS.MAX_STAKE] (1..20).
  const { data, error } = await supabase.rpc('place_prediction_stake', {
    p_prediction_id: predictionId,
    p_answer: answer,
    p_stake: Math.trunc(stake),
    p_room_id: roomId ?? null,
  });

  if (error) return rpcErrorResponse(error);

  // data = { stake: <prediction_stakes row>, balance: <MP after debit> }
  return NextResponse.json(data);
}
