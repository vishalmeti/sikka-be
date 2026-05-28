import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
});

export const updateFcmTokenSchema = z.object({
  fcmToken: z.string().min(1),
});
