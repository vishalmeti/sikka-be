import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { env } from "../config";
import { AppError } from "../utils/errors";

/**
 * Dispatch a 6-digit OTP via AWS SNS direct SMS publish.
 *
 *   PublishCommand({
 *     PhoneNumber: "+91...",            // E.164, no TopicArn
 *     Message:     "<code> is your...",
 *     MessageAttributes: {
 *       "AWS.SNS.SMS.SMSType":  "Transactional",   // higher priority + reliability vs "Promotional"
 *       "AWS.SNS.SMS.SenderID": "<sender>"         // optional, region-gated
 *     }
 *   })
 *
 * Note this is direct publish, **not** a Topic + SMS subscription —
 * topics broadcast the same payload to every subscriber, which is the
 * wrong primitive for per-user OTPs.
 *
 * Sandbox: while the account is in the SNS SMS sandbox, only verified
 * destination numbers receive the message. Unverified numbers fail with
 * an `InvalidParameter` error that we map to a friendly hint. The daily
 * spend cap (~$1) and per-region delivery quotas still apply.
 *
 * Dev fallback: when SMS_DEV_MODE=true we skip the SDK call entirely
 * and log the code to stdout, so the flow stays testable without AWS
 * creds.
 */

// Singleton client so subsequent calls reuse the underlying HTTPS agent.
// When the explicit creds are absent we pass nothing and the SDK falls
// back to its default credential chain (shared config, IAM role, etc.).
const sns = new SNSClient({
  region: env.AWS_REGION,
  ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

export async function sendSmsOtp(params: {
  phone: string;
  code: string;
}): Promise<{
  delivered: boolean;
  devMode: boolean;
  providerStatus?: string;
  providerMessageId?: string;
}> {
  const { phone, code } = params;

  if (env.SMS_DEV_MODE) {
    console.warn(
      `[sns] SMS_DEV_MODE=true — OTP for ${phone} is ${code} (no SMS sent)`,
    );
    return { delivered: false, devMode: true };
  }

  const command = new PublishCommand({
    PhoneNumber: phone,
    Message: `${code} is your Sikka verification code. Valid for 5 minutes.`,
    MessageAttributes: {
      "AWS.SNS.SMS.SMSType": {
        DataType: "String",
        StringValue: "Transactional",
      },
      ...(env.AWS_SMS_SENDER_ID && {
        "AWS.SNS.SMS.SenderID": {
          DataType: "String",
          StringValue: env.AWS_SMS_SENDER_ID,
        },
      }),
    },
  });

  let messageId: string | undefined;
  try {
    const result = await sns.send(command);
    messageId = result.MessageId;
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    console.error(
      `[sns] publish failed for ${phone}: name=${e.name ?? "?"} message=${e.message ?? "?"}`,
    );
    throw new AppError(502, friendlySnsError(e), "OTP_PROVIDER_ERROR");
  }

  console.log(`[sns] sent → ${phone}: messageId=${messageId ?? "?"}`);

  return {
    delivered: true,
    devMode: false,
    providerStatus: "sent",
    providerMessageId: messageId,
  };
}

function friendlySnsError(err: { name?: string; message?: string }): string {
  const name = err.name ?? "";
  const msg = err.message ?? "";

  // Sandbox accounts can only SMS verified destination numbers; the SDK
  // reports this as InvalidParameter with the phrase below in `message`.
  if (
    name === "InvalidParameterException" &&
    /destination phone number|not verified|sandbox/i.test(msg)
  ) {
    return "This phone number isn't verified in the SNS sandbox. Add it under SNS → Text messaging (SMS) → Sandbox destination numbers, or request production access.";
  }
  if (name === "OptedOutException") {
    return "This phone number has opted out of receiving SMS from your AWS account.";
  }
  if (
    name === "AuthorizationErrorException" ||
    name === "UnauthorizedException"
  ) {
    return "AWS rejected the SNS publish — check the IAM policy on your access key grants sns:Publish.";
  }
  if (name === "InvalidClientTokenId" || name === "UnrecognizedClientException") {
    return "AWS rejected the credentials. Check AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.";
  }
  if (name === "ThrottlingException") {
    return "AWS SNS is throttling SMS sends — retry shortly.";
  }
  return msg && msg.length < 200 ? `SNS error: ${msg}` : "SNS rejected the SMS send.";
}
