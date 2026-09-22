// Maps the short error codes raised by the Postgres RPCs
// (place_prediction_stake, join_room_by_code, create_room, ...) to
// HTTP responses. Copy is deliberately free of betting language
// (PRD §11.5).
import { NextResponse } from 'next/server';

const KNOWN_ERRORS: Record<string, { status: number; message: string }> = {
  unauthorized: { status: 401, message: 'Please sign in again.' },
  invalid_stake: { status: 400, message: 'Enter a valid amount of MP.' },
  invalid_answer: { status: 400, message: "That isn't one of the options for this market." },
  prediction_not_found: { status: 404, message: 'Prediction not found.' },
  prediction_closed: { status: 409, message: 'This market is closed.' },
  already_predicted: { status: 409, message: "You've already made a prediction on this market." },
  insufficient_balance: { status: 409, message: "You don't have enough MP for that." },
  not_a_member: { status: 403, message: "You're not a member of that room." },
  room_not_available: { status: 400, message: "That room isn't available for this match." },
  room_not_found: { status: 404, message: 'Room not found.' },
  room_full: { status: 409, message: 'This room is full.' },
  banned: { status: 403, message: "You can't join this room." },
  invalid_name: { status: 400, message: 'Give your room a name (3-60 characters).' },
  invalid_room_type: { status: 400, message: 'Invalid room type.' },
  match_not_found: { status: 404, message: 'Match not found.' },
};

export function rpcErrorResponse(error: { message: string }) {
  const known = KNOWN_ERRORS[error.message.trim()];
  if (known) {
    return NextResponse.json({ error: known.message, code: error.message.trim() }, { status: known.status });
  }
  console.error('Unexpected RPC error:', error.message);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}
