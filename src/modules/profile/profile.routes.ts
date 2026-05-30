import { Router } from "express";
import { ProfileController } from "./profile.controller";
import { authenticate, validate } from "../../middleware";
import { updateProfileSchema, updateFcmTokenSchema } from "./profile.schema";
import { sendPhoneOtpSchema, verifyPhoneOtpSchema } from "./phone.schema";

const router = Router();
const controller = new ProfileController();

router.use(authenticate as any);

router.get("/", controller.getProfile as any);
router.put("/", validate(updateProfileSchema), controller.updateProfile as any);
router.put("/fcm-token", validate(updateFcmTokenSchema), controller.updateFcmToken as any);
router.post(
  "/phone/send-otp",
  validate(sendPhoneOtpSchema),
  controller.sendPhoneOtp as any,
);
router.post(
  "/phone/verify",
  validate(verifyPhoneOtpSchema),
  controller.verifyPhoneOtp as any,
);

export default router;
