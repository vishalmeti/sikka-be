import bcrypt from "bcryptjs";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { UserRole } from "../types";

interface AccessPayload extends JwtPayload {
  sub: string;
  role: UserRole;
  type: "access";
}

interface RefreshPayload extends JwtPayload {
  sub: string;
  type: "refresh";
}

const BCRYPT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(userId: string, role: UserRole): string {
  const payload: AccessPayload = { sub: userId, role, type: "access" };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as SignOptions["expiresIn"],
  });
}

export function signRefreshToken(userId: string): string {
  const payload: RefreshPayload = { sub: userId, type: "refresh" };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === "string" || decoded.type !== "access" || !decoded.sub) {
    throw new Error("Not an access token");
  }
  return decoded as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === "string" || decoded.type !== "refresh" || !decoded.sub) {
    throw new Error("Not a refresh token");
  }
  return decoded as RefreshPayload;
}
