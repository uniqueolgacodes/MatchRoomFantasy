// Why this exists: for real matches, matches.status stays 'scheduled'
// from kickoff until the half-time poll runs (~kickoff + 45 min), and
// the pages used to treat "no open markets" as "not open yet". Once a
// match kicked off its markets locked, the list came back empty, and
// the page said "Predictions open closer to kickoff" in the middle of
// the game. The phase is now worked out from status AND the clock.
export type MatchPhase =
  | "upcoming"
  | "in_play"
  | "half_time"
  | "awaiting_result"
  | "finished"
  | "postponed"
  | "cancelled";

// Full-time polling starts ~90 min after kickoff and retries for a
// while. Past 3 hours with no final status, say "awaiting result"
// instead of claiming it is still live.
const AWAITING_RESULT_AFTER_MS = 3 * 60 * 60 * 1000;

export function deriveMatchPhase(
  status: string,
  kickoff: string,
  nowMs: number = Date.now(),
): MatchPhase {
  if (status === "full_time") return "finished";
  if (status === "cancelled") return "cancelled";
  if (status === "postponed" || status === "suspended") return "postponed";

  const sinceKickoff = nowMs - new Date(kickoff).getTime();
  if (sinceKickoff < 0) return "upcoming";
  if (sinceKickoff > AWAITING_RESULT_AFTER_MS) return "awaiting_result";
  if (status === "half_time") return "half_time";
  return "in_play";
}

export function phaseLabel(phase: MatchPhase): string {
  switch (phase) {
    case "upcoming":
      return "Upcoming";
    case "in_play":
      return "Live";
    case "half_time":
      return "Half-time";
    case "awaiting_result":
      return "Awaiting result";
    case "finished":
      return "Full time";
    case "postponed":
      return "Postponed";
    case "cancelled":
      return "Cancelled";
  }
}

export interface PickSummary {
  id: string;
  question: string;
  answer: string;
  stake: number;
  potentialPayout: number;
  result: "pending" | "won" | "lost" | "void";
  payout: number | null;
}

interface PredictionRow {
  id: string;
  question: string;
}

interface StakeRow {
  prediction_id: string;
  answer: string;
  stake: number;
  potential_payout: number;
  is_correct: boolean | null;
  points_awarded: number | null;
  settled_at: string | null;
}

/** Joins a user's stakes to their market questions and works out each outcome. */
export function buildPicks(
  predictions: PredictionRow[],
  stakes: StakeRow[],
): PickSummary[] {
  const questionById = new Map(predictions.map((p) => [p.id, p.question]));
  return stakes.map((s) => {
    const settled = s.settled_at !== null;
    const result: PickSummary["result"] = !settled
      ? "pending"
      : s.is_correct === true
        ? "won"
        : s.is_correct === false
          ? "lost"
          : "void";
    return {
      id: s.prediction_id,
      question: questionById.get(s.prediction_id) ?? "Prediction",
      answer: s.answer,
      stake: s.stake,
      potentialPayout: s.potential_payout,
      result,
      payout: s.points_awarded,
    };
  });
}
