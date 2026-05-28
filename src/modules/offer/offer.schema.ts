import { z } from "zod";

export const createOfferSchema = z.object({
  storeId: z.string().uuid(),
  title: z.string().min(2).max(200),
  offerType: z.enum(["double_coins", "bonus_coins", "spend_and_earn"]),
  multiplier: z.number().min(1).default(1),
  bonusAmount: z.number().min(0).default(0),
  minSpend: z.number().min(0).default(0),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

export const updateOfferSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  multiplier: z.number().min(1).optional(),
  bonusAmount: z.number().min(0).optional(),
  minSpend: z.number().min(0).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});
