// PRD §15 — place a prediction stake. Server-validates the lock time
// and clamps the stake, then debits via apply_point_transaction.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { POINTS } from '@/lib/points/constants';

export async function POST(req: NextRequest) {
  const { predictionId, answer, stake, roomId } = await req.json();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: prediction } = await supabase
    .from('predictions')
    .select('*')
    .eq('id', predictionId)
    .eq('status', 'open')
    .single();

  if (!prediction) return NextResponse.json({ error: 'Prediction not available' }, { status: 400 });
  if (new Date(prediction.locks_at) < new Date()) {
    return NextResponse.json({ error: 'Locked' }, { status: 400 });
  }

  if (roomId) {
    const { data: member } = await supabase
      .from('room_members')
      .select('user_id')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  }

  const clampedStake = Math.min(Math.max(stake, POINTS.MIN_STAKE), POINTS.MAX_STAKE);
  const potentialPayout = Math.floor(clampedStake * prediction.odds_multiplier);

  await supabase.rpc('apply_point_transaction', {
    p_user_id: user.id, p_amount: -clampedStake,
    p_reason: 'prediction_stake', p_reference_id: predictionId,
    p_metadata: { room_id: roomId },
  });

  const { data, error } = await supabase
    .from('prediction_stakes')
    .insert({
      prediction_id: predictionId, user_id: user.id, room_id: roomId ?? null,
      answer, stake: clampedStake, odds_multiplier: prediction.odds_multiplier,
      potential_payout: potentialPayout,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stake: data });
}
