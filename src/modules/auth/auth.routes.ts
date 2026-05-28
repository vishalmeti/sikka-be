import { Router } from "express";
import { AuthController } from "./auth.controller";
import { validate } from "../../middleware";
import { sendOtpSchema, verifyOtpSchema, signupSchema, refreshTokenSchema } from "./auth.schema";

const router = Router();
const controller = new AuthController();

router.post("/send-otp", validate(sendOtpSchema), controller.sendOtp);
router.post("/verify-otp", validate(verifyOtpSchema), controller.verifyOtp);
router.post("/signup", validate(signupSchema), controller.signup);
router.post("/refresh", validate(refreshTokenSchema), controller.refreshToken);

export default router;
