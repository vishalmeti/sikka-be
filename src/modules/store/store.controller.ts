import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../types";
import { StoreService } from "./store.service";
import { sendSuccess } from "../../utils/response";
import { param } from "../../utils/params";

const storeService = new StoreService();

export class StoreController {
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await storeService.create(req.userId, req.body);
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await storeService.getById(param(req.params.id));
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getByUpiId(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await storeService.getByUpiId(param(req.params.upiId));
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getMyStores(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await storeService.getOwnerStores(req.userId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async listActive(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await storeService.listActive();
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await storeService.update(param(req.params.id), req.userId, req.body);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
}
