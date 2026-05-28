import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../types";
import { WalletService } from "./wallet.service";
import { sendSuccess } from "../../utils/response";
import { param } from "../../utils/params";

const walletService = new WalletService();

export class WalletController {
  async getMyWallets(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await walletService.getCustomerWallets(req.userId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getWalletForStore(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await walletService.getWalletForStore(req.userId, param(req.params.storeId));
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await walletService.getDashboard(req.userId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
}
