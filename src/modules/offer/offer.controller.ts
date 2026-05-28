import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../types";
import { OfferService } from "./offer.service";
import { sendSuccess } from "../../utils/response";
import { param } from "../../utils/params";

const offerService = new OfferService();

export class OfferController {
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await offerService.create(req.userId, req.body);
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await offerService.update(param(req.params.id), req.userId, req.body);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await offerService.delete(param(req.params.id), req.userId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getStoreOffers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const activeOnly = req.query.active === "true";
      const result = await offerService.getStoreOffers(param(req.params.storeId), activeOnly);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
}
