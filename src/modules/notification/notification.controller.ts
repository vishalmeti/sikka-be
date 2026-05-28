import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../types";
import { NotificationService } from "./notification.service";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { parsePagination } from "../../utils/pagination";
import { param } from "../../utils/params";

const notificationService = new NotificationService();

export class NotificationController {
  async getNotifications(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req);
      const result = await notificationService.getUserNotifications(req.userId, pagination);
      sendPaginated(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getUnreadCount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await notificationService.getUnreadCount(req.userId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async markAsRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await notificationService.markAsRead(param(req.params.id), req.userId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async markAllAsRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await notificationService.markAllAsRead(req.userId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
}
