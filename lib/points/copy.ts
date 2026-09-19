// User-facing copy layer for the Match Points system.
// PRD v5 §11.6 / §32.5 Regulatory Notes: internal fields keep their
// schema names ("stake", "odds_multiplier", "prediction_win"), but
// this is the ONLY layer that should render user-visible strings —
// never surface "bet", "stake", or "win" directly in UI copy.
export const MP_COPY = {
  placeSelection: 'Predict',
  amountLabel: 'MP to predict',
  correctResult: (mp: number) => `You earned ${mp} MP`,
  incorrectResult: 'No MP earned this time',
  balanceLabel: 'Your MP',
} as const;
