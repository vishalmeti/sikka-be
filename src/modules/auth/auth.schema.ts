import { z } from "zod";

export const sendOtpSchema = z.object({
  phone: z.string().regex(/^\+91\d{10}$/, "Phone must be in +91XXXXXXXXXX format"),
});

export const verifyOtpSchema = z.object({
  phone: z.string().regex(/^\+91\d{10}$/, "Phone must be in +91XXXXXXXXXX format"),
  otp: z.string().length(6, "OTP must be 6 digits"),
});

export const signupSchema = z.object({
  phone: z.string().regex(/^\+91\d{10}$/, "Phone must be in +91XXXXXXXXXX format"),
  otp: z.string().length(6, "OTP must be 6 digits"),
  name: z.string().min(2).max(100).optional(),
  role: z.enum(["customer", "owner"]),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
