// Match Points constants. PRD v5 §11.1.
// Internal names intentionally match the schema (stake, odds, etc.)
// per the Decisions Log — user-facing copy renders these as
// "predict" / "MP earned", never "bet" / "win". See
// lib/points/copy.ts for the user-facing string layer.
export const POINTS = {
  NEW_SIGNUP_BALANCE: 10,
  SEASON_START_BALANCE: 10,
  SEASON_CHAMPION_PURSE: 100,
  REFERRAL_NEW_USER_BONUS: 5,
  REFERRAL_REFERRER_BONUS: 20,
  WELCOME_BACK_REWARD: 10,
  WELCOME_BACK_DAYS: 60,
  MIN_BALANCE: 0,
  MAX_STAKE: 20,
  MIN_STAKE: 1,
  REVIVAL_THRESHOLD: 1,
  REVIVAL_MAX_WIN: 5,
  REVIVAL_COOLDOWN_MINUTES: 15,
  PRIVATE_ROOM_WIN_BONUS: 10,
  PRIVATE_ROOM_MIN_MEMBERS: 3,
} as const;
