import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().min(1),

  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),

  JWT_SECRET: z.string().min(1),
  // 1h access, 30d refresh. Override via env if you need shorter/longer.
  JWT_ACCESS_TTL: z.string().default("1h"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  CORS_ORIGIN: z.string().default("*"),

  // AWS SNS — OTP SMS delivery.
  //
  // AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY: when both are set we
  // hand them to the SNS client explicitly. When either is blank the
  // SDK falls back to its default credential chain (shared config file,
  // EC2/ECS instance role, etc.) — that's the path you want in
  // production behind an IAM role.
  //
  // AWS_REGION: SNS endpoint region. ap-south-1 = Mumbai.
  // AWS_SMS_SENDER_ID: optional alphanumeric sender. Only honoured on
  //   routes that allow it; in India this needs DLT registration.
  //   Leave blank to use the AWS default sender.
  // SMS_DEV_MODE=true: short-circuit SNS and log the OTP to stdout —
  //   useful when AWS creds aren't configured locally.
  AWS_ACCESS_KEY_ID: z.string().default(""),
  AWS_SECRET_ACCESS_KEY: z.string().default(""),
  AWS_REGION: z.string().default("ap-south-1"),
  AWS_SMS_SENDER_ID: z.string().default(""),
  SMS_DEV_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
