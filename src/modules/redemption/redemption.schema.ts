import { z } from "zod";

export const createRedemptionSchema = z.object({
  storeId: z.string().uuid(),
  coinsToRedeem: z.number().positive(),
  billAmount: z.number().positive(),
});

export const resolveRedemptionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});
