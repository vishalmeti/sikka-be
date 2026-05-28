import { Request } from "express";

export interface AuthenticatedRequest extends Request {
  userId: string;
  userRole: "customer" | "owner";
}

export type UserRole = "customer" | "owner";
export type TransactionStatus = "pending" | "confirmed" | "failed";
export type RedemptionStatus = "pending" | "approved" | "rejected";
export type Tier = "bronze" | "silver" | "gold";
export type OfferType = "double_coins" | "bonus_coins" | "spend_and_earn";
export type NotificationType =
  | "coins_earned"
  | "redemption_requested"
  | "redemption_confirmed"
  | "redemption_rejected"
  | "streak_bonus"
  | "offer";

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
