export const EARN_RATE = 0.05;
export const REDEEM_RATE = 2;
export const MAX_REDEMPTION_PERCENT = 0.20;

export const TIER_THRESHOLDS = {
  bronze: 0,
  silver: 200,
  gold: 500,
} as const;

export const STREAK_BONUSES: Record<number, number> = {
  3: 10,
  7: 25,
};
