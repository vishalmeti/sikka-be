import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../types";
import { RedemptionService } from "./redemption.service";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { parsePagination } from "../../utils/pagination";
import { param } from "../../utils/params";

const redemptionService = new RedemptionService();

export class RedemptionController {
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { storeId, coinsToRedeem, billAmount } = req.body;
      const result = await redemptionService.create(req.userId, storeId, coinsToRedeem, billAmount);
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  async resolve(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await redemptionService.resolve(param(req.params.id), req.userId, req.body.status);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getMyRedemptions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req);
      const result = await redemptionService.getCustomerRedemptions(req.userId, pagination);
      sendPaginated(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getStoreRedemptions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req);
      const result = await redemptionService.getStoreRedemptions(
        param(req.params.storeId),
        req.userId,
        pagination
      );
      sendPaginated(res, result);
    } catch (err) {
      next(err);
    }
  }
}
