import { Response, NextFunction } from "express";
import { supabaseAdmin } from "../config";
import { AuthenticatedRequest, UserRole } from "../types";
import { UnauthorizedError, ForbiddenError } from "../utils/errors";

export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid authorization header");
    }

    const token = header.slice(7);
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedError("Invalid or expired token");
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (!profile) {
      throw new UnauthorizedError("User profile not found");
    }

    req.userId = data.user.id;
    req.userRole = profile.role as UserRole;
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
