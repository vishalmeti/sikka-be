import { createHash, randomInt } from "node:crypto";
import { query, queryOne, withTx } from "../../config";
import { AppError, ConflictError, ValidationError } from "../../utils/errors";
import { sendSmsOtp } from "../../integrations/sns";

// Tunables. Kept small + per-user since this is the only path that
// reaches SNS, and every send costs an SMS.
const OTP_TTL_SEC = 5 * 60;
const RESEND_COOLDOWN_SEC = 30;
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

interface OtpRow {
  id: string;
  user_id: string;
  phone: string;
  code_hash: string;
  attempts: number;
  sent_at: string;
  expires_at: string;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  // 6 digits, zero-padded. crypto.randomInt avoids Math.random bias.
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export class PhoneVerificationService {
  /**
   * Generate a code, persist its hash, and dispatch it via SNS. Throttled
   * per user (cooldown + hourly cap) so a single bad actor can't burn the
   * SMS budget.
   */
  async sendOtp(userId: string, phone: string) {
    // If somebody else already verified this number we refuse early — both
    // to save an SMS round-trip and to keep the error message stable.
    const owner = await queryOne<{ id: string }>(
      `SELECT id FROM profiles
       WHERE phone = $1 AND phone_verified_at IS NOT NULL`,
      [phone],
    );
    if (owner && owner.id !== userId) {
      throw new ConflictError("This phone is already linked to another account");
    }

    const lastSend = await queryOne<{ sent_at: string }>(
      `SELECT sent_at FROM phone_otps
       WHERE user_id = $1 AND phone = $2
       ORDER BY sent_at DESC LIMIT 1`,
      [userId, phone],
    );
    if (lastSend) {
      const elapsedSec = (Date.now() - new Date(lastSend.sent_at).getTime()) / 1000;
      if (elapsedSec < RESEND_COOLDOWN_SEC) {
        const wait = Math.ceil(RESEND_COOLDOWN_SEC - elapsedSec);
        throw new AppError(
          429,
          `Please wait ${wait}s before requesting another code`,
          "OTP_COOLDOWN",
        );
      }
    }

    const hourly = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM phone_otps
       WHERE user_id = $1 AND sent_at > now() - interval '1 hour'`,
      [userId],
    );
    if (hourly && Number(hourly.count) >= MAX_SENDS_PER_HOUR) {
      throw new AppError(
        429,
        "Too many OTP requests. Try again in an hour.",
        "OTP_RATE_LIMITED",
      );
    }

    const code = generateCode();
    const codeHash = hashCode(code);

    // Insert FIRST so a second concurrent request hits the cooldown
    // check on the next iteration — but undo it if SNS rejects the
    // send, otherwise provider failures burn the user's hourly quota.
    const inserted = await queryOne<{ id: string }>(
      `INSERT INTO phone_otps (user_id, phone, code_hash, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval)
       RETURNING id`,
      [userId, phone, codeHash, OTP_TTL_SEC],
    );

    let delivery;
    try {
      delivery = await sendSmsOtp({ phone, code });
    } catch (err) {
      if (inserted) {
        await query(`DELETE FROM phone_otps WHERE id = $1`, [inserted.id]);
      }
      throw err;
    }

    return {
      sentAt: new Date().toISOString(),
      ttlSec: OTP_TTL_SEC,
      resendInSec: RESEND_COOLDOWN_SEC,
      // Surface devMode so the client can show a "check server logs" hint
      // when SMS_DEV_MODE is on (no real SMS was sent).
      devMode: delivery.devMode,
    };
  }

  /**
   * Verify a code against the most recent OTP for (user, phone). On match
   * we link the number in a single transaction so the unique constraint
   * fires atomically — if another user verified the same phone in the
   * window between sendOtp and verifyOtp, we surface a clean 409.
   */
  async verifyOtp(userId: string, phone: string, code: string) {
    const otp = await queryOne<OtpRow>(
      `SELECT id, user_id, phone, code_hash, attempts, sent_at, expires_at
       FROM phone_otps
       WHERE user_id = $1 AND phone = $2
       ORDER BY sent_at DESC LIMIT 1`,
      [userId, phone],
    );

    if (!otp) {
      throw new ValidationError("Request a new code — none is active");
    }
    if (new Date(otp.expires_at).getTime() < Date.now()) {
      throw new ValidationError("Code expired. Request a new one.");
    }
    if (otp.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw new ValidationError("Too many attempts. Request a new code.");
    }

    if (otp.code_hash !== hashCode(code)) {
      await query(
        `UPDATE phone_otps SET attempts = attempts + 1 WHERE id = $1`,
        [otp.id],
      );
      throw new ValidationError("Incorrect code. Try again.");
    }

    try {
      return await withTx(async (client) => {
        const result = await client.query<{
          id: string;
          username: string;
          name: string | null;
          phone: string | null;
          phone_verified_at: string | null;
          role: string;
          fcm_token: string | null;
          created_at: string;
          updated_at: string;
        }>(
          `UPDATE profiles
             SET phone = $2, phone_verified_at = now()
           WHERE id = $1
           RETURNING id, username, name, phone, phone_verified_at,
                    role, fcm_token, created_at, updated_at`,
          [userId, phone],
        );

        // Burn all pending OTPs for this user so the verified link can't
        // be re-validated and the slate is clean for a future phone swap.
        await client.query(`DELETE FROM phone_otps WHERE user_id = $1`, [userId]);

        return result.rows[0];
      });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === "23505") {
        throw new ConflictError(
          "This phone is already linked to another account",
        );
      }
      throw err;
    }
  }
}
