import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../types";
import { TransactionService } from "./transaction.service";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { parsePagination } from "../../utils/pagination";
import { param } from "../../utils/params";

const transactionService = new TransactionService();

export class TransactionController {
  async createOrder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await transactionService.createOrder(
        req.userId,
        req.body.storeId,
        req.body.amount
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  async verifyPayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
      const result = await transactionService.verifyPayment(
        req.userId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getMyTransactions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req);
      const result = await transactionService.getCustomerTransactions(req.userId, pagination);
      sendPaginated(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getStoreTransactions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req);
      const result = await transactionService.getStoreTransactions(
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
