import { query, queryOne } from "../../config";
import { NotFoundError, AppError } from "../../utils/errors";

const PUBLIC_COLUMNS =
  "id, username, name, phone, role, fcm_token, created_at, updated_at";

export class ProfileService {
  async getProfile(userId: string) {
    const profile = await queryOne(
      `SELECT ${PUBLIC_COLUMNS} FROM profiles WHERE id = $1`,
      [userId],
    );
    if (!profile) throw new NotFoundError("Profile");
    return profile;
  }

  async updateProfile(userId: string, updates: { name?: string }) {
    if (updates.name === undefined) {
      return this.getProfile(userId);
    }
    try {
      const profile = await queryOne(
        `UPDATE profiles SET name = $2
         WHERE id = $1
         RETURNING ${PUBLIC_COLUMNS}`,
        [userId, updates.name],
      );
      if (!profile) throw new NotFoundError("Profile");
      return profile;
    } catch (err: unknown) {
      if (err instanceof NotFoundError) throw err;
      throw new AppError(400, (err as Error).message);
    }
  }

  async updateFcmToken(userId: string, fcmToken: string) {
    const rows = await query(
      "UPDATE profiles SET fcm_token = $2 WHERE id = $1 RETURNING id",
      [userId, fcmToken],
    );
    if (rows.length === 0) throw new NotFoundError("Profile");
    return { message: "FCM token updated" };
  }
}
