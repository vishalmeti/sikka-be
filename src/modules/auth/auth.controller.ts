import { Request, Response, NextFunction } from "express";
import { AuthService } from "./auth.service";
import { sendSuccess } from "../../utils/response";

const authService = new AuthService();

export class AuthController {
  async sendOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.sendOtp(req.body.phone);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async verifyOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.verifyOtp(req.body.phone, req.body.otp);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async signup(req: Request, res: Response, next: NextFunction) {
    try {
      const { phone, otp, name, role } = req.body;
      const result = await authService.signup(phone, otp, name, role);
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.refreshToken(req.body.refreshToken);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
}
