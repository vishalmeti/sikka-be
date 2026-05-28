import { Router } from "express";
import { NotificationController } from "./notification.controller";
import { authenticate } from "../../middleware";

const router = Router();
const controller = new NotificationController();

router.use(authenticate as any);

router.get("/", controller.getNotifications as any);
router.get("/unread-count", controller.getUnreadCount as any);
router.put("/read-all", controller.markAllAsRead as any);
router.put("/:id/read", controller.markAsRead as any);

export default router;
