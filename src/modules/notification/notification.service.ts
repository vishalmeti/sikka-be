import { supabaseAdmin } from "../../config";
import { AppError, NotFoundError } from "../../utils/errors";
import { NotificationType, PaginationParams } from "../../types";
import { paginationRange } from "../../utils/pagination";

export class NotificationService {
  async create(userId: string, data: {
    title: string;
    body: string;
    type: NotificationType;
    referenceId?: string;
  }) {
    const { error } = await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      title: data.title,
      body: data.body,
      type: data.type,
      reference_id: data.referenceId,
    });

    if (error) console.error("Failed to create notification:", error.message);
  }

  async getUserNotifications(userId: string, pagination: PaginationParams) {
    const { from, to } = paginationRange(pagination);

    const { data, error, count } = await supabaseAdmin
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new AppError(400, error.message);

    return {
      data: data || [],
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pagination.limit),
      },
    };
  }

  async getUnreadCount(userId: string) {
    const { count, error } = await supabaseAdmin
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) throw new AppError(400, error.message);
    return { unreadCount: count || 0 };
  }

  async markAsRead(notificationId: string, userId: string) {
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error || !data) throw new NotFoundError("Notification");
    return data;
  }

  async markAllAsRead(userId: string) {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) throw new AppError(400, error.message);
    return { message: "All notifications marked as read" };
  }
}
