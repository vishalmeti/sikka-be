import { TIER_THRESHOLDS } from "../config/constants";
import { Tier } from "../types";

export function computeTier(totalEarned: number): Tier {
  if (totalEarned >= TIER_THRESHOLDS.gold) return "gold";
  if (totalEarned >= TIER_THRESHOLDS.silver) return "silver";
  return "bronze";
}

export function tierProgress(totalEarned: number): number {
  if (totalEarned >= TIER_THRESHOLDS.gold) return 1;
  if (totalEarned >= TIER_THRESHOLDS.silver) {
    return (totalEarned - TIER_THRESHOLDS.silver) / (TIER_THRESHOLDS.gold - TIER_THRESHOLDS.silver);
  }
  return totalEarned / TIER_THRESHOLDS.silver;
}
