import { Response, NextFunction } from "express";
import { AuthenticatedRequest, UserRole } from "../types";
import { UnauthorizedError, ForbiddenError } from "../utils/errors";
import { verifyAccessToken } from "../utils/auth";

export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid authorization header");
    }

    const token = header.slice(7);

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new UnauthorizedError("Invalid or expired token");
    }

    req.userId = payload.sub;
    req.userRole = payload.role;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!roles.includes(req.userRole)) {
      return next(new ForbiddenError(`Requires role: ${roles.join(" or ")}`));
    }
    next();
  };
}
