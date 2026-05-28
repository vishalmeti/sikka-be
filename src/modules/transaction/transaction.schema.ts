import { z } from "zod";

export const createOrderSchema = z.object({
  storeId: z.string().uuid(),
  amount: z.number().positive(),
});

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});
