import { supabaseAdmin } from "../../config";
import { NotFoundError, AppError } from "../../utils/errors";

export class ProfileService {
  async getProfile(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error || !data) throw new NotFoundError("Profile");
    return data;
  }

  async updateProfile(userId: string, updates: { name?: string }) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();

    if (error) throw new AppError(400, error.message);
    return data;
  }

  async updateFcmToken(userId: string, fcmToken: string) {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ fcm_token: fcmToken })
      .eq("id", userId);

    if (error) throw new AppError(400, error.message);
    return { message: "FCM token updated" };
  }
}
