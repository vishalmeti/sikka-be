import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../types";
import { ProfileService } from "./profile.service";
import { PhoneVerificationService } from "./phone.service";
import { sendSuccess } from "../../utils/response";

const profileService = new ProfileService();
const phoneService = new PhoneVerificationService();

export class ProfileController {
  async getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await profileService.getProfile(req.userId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async updateProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await profileService.updateProfile(req.userId, req.body);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async updateFcmToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await profileService.updateFcmToken(req.userId, req.body.fcmToken);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async sendPhoneOtp(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await phoneService.sendOtp(req.userId, req.body.phone);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async verifyPhoneOtp(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await phoneService.verifyOtp(
        req.userId,
        req.body.phone,
        req.body.code,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
}
