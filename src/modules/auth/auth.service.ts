import { queryOne } from "../../config";
import { AppError, ConflictError, UnauthorizedError } from "../../utils/errors";
import {
  hashPassword,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from "../../utils/auth";
import { UserRole } from "../../types";

interface ProfileRow {
  id: string;
  username: string;
  name: string | null;
  phone: string | null;
  phone_verified_at: string | null;
  role: UserRole;
  fcm_token: string | null;
  created_at: string;
  updated_at: string;
}

// Strip the password hash before returning a profile to the caller.
const PUBLIC_COLUMNS =
  "id, username, name, phone, phone_verified_at, role, fcm_token, created_at, updated_at";

export class AuthService {
  async register(
    username: string,
    password: string,
    name: string | undefined,
    role: UserRole,
  ) {
    const passwordHash = await hashPassword(password);

    let profile: ProfileRow;
    try {
      profile = (await queryOne<ProfileRow>(
        `INSERT INTO profiles (username, password_hash, name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING ${PUBLIC_COLUMNS}`,
        [username, passwordHash, name ?? null, role],
      ))!;
    } catch (err: unknown) {
      // 23505 = unique_violation. Only the username index is unique on this table.
      if ((err as { code?: string })?.code === "23505") {
        throw new ConflictError("Username already taken");
      }
      throw new AppError(400, (err as Error).message || "Could not create account");
    }

    return this.issueTokens(profile);
  }

  async login(username: string, password: string) {
    const row = await queryOne<ProfileRow & { password_hash: string }>(
      `SELECT ${PUBLIC_COLUMNS}, password_hash
       FROM profiles
       WHERE lower(username) = lower($1)`,
      [username],
    );

    if (!row || !(await verifyPassword(password, row.password_hash))) {
      throw new UnauthorizedError("Invalid username or password");
    }

    const { password_hash: _ignored, ...profile } = row;
    return this.issueTokens(profile as ProfileRow);
  }

  async refreshToken(refreshToken: string) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError("Invalid refresh token");
    }

    const profile = await queryOne<ProfileRow>(
      `SELECT ${PUBLIC_COLUMNS} FROM profiles WHERE id = $1`,
      [payload.sub],
    );

    if (!profile) throw new UnauthorizedError("Invalid refresh token");

    return {
      accessToken: signAccessToken(profile.id, profile.role),
      refreshToken: signRefreshToken(profile.id),
    };
  }

  private issueTokens(profile: ProfileRow) {
    return {
      accessToken: signAccessToken(profile.id, profile.role),
      refreshToken: signRefreshToken(profile.id),
      user: profile,
    };
  }
}
