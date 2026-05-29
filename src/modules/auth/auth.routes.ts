import { Router } from "express";
import { AuthController } from "./auth.controller";
import { validate } from "../../middleware";
import { registerSchema, loginSchema, refreshTokenSchema } from "./auth.schema";

const router = Router();
const controller = new AuthController();

router.post("/register", validate(registerSchema), controller.register);
router.post("/login", validate(loginSchema), controller.login);
router.post("/refresh", validate(refreshTokenSchema), controller.refreshToken);

export default router;
