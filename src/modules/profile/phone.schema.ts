import { z } from "zod";

// Accept Indian 10-digit mobiles, with or without a +91 / 91 / 0 prefix.
// Normalised to E.164 (+91XXXXXXXXXX) before any DB / SNS interaction.
const phoneInput = z
  .string()
  .trim()
  .transform((raw) => raw.replace(/[\s\-()]/g, ""))
  .refine((s) => /^(?:\+?91|0)?[6-9]\d{9}$/.test(s), {
    message: "Enter a valid 10-digit Indian mobile number",
  })
  .transform((s) => {
    const tenDigit = s.replace(/^(?:\+?91|0)/, "");
    return `+91${tenDigit}`;
  });

export const sendPhoneOtpSchema = z.object({
  phone: phoneInput,
});

export const verifyPhoneOtpSchema = z.object({
  phone: phoneInput,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from the SMS"),
});
