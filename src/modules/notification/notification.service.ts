import { query, queryOne, queryCount } from "../../config";
import { NotFoundError } from "../../utils/errors";
import { NotificationType, PaginationParams } from "../../types";

interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: NotificationType;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}

export class NotificationService {
  async create(
    userId: string,
    data: { title: string; body: string; type: NotificationType; referenceId?: string },
  ) {
    try {
      await query(
        `INSERT INTO notifications (user_id, title, body, type, reference_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, data.title, data.body, data.type, data.referenceId ?? null],
      );
    } catch (err: unknown) {
      // Notifications are best-effort — log and swallow so we don't block the
      // operation that triggered them.
      console.error("Failed to create notification:", (err as Error).message);
    }
  }

  async getUserNotifications(userId: string, pagination: PaginationParams) {
    const offset = (pagination.page - 1) * pagination.limit;
    const data = await query<NotificationRow>(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, pagination.limit, offset],
    );

    const total = await queryCount(
      "SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1",
      [userId],
    );

    return {
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async getUnreadCount(userId: string) {
    const unreadCount = await queryCount(
      "SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1 AND is_read = false",
      [userId],
    );
    return { unreadCount };
  }

  async markAsRead(notificationId: string, userId: string) {
    const row = await queryOne<NotificationRow>(
      `UPDATE notifications SET is_read = true
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [notificationId, userId],
    );
    if (!row) throw new NotFoundError("Notification");
    return row;
  }

  async markAllAsRead(userId: string) {
    await query(
      "UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false",
      [userId],
    );
    return { message: "All notifications marked as read" };
  }
}
