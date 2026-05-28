import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors";
import { sendError } from "../utils/response";
import { env } from "../config";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.message, err.code);
    return;
  }

  if (err instanceof ZodError) {
    const messages = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`);
    sendError(res, 400, messages.join("; "), "VALIDATION_ERROR");
    return;
  }

  console.error("Unhandled error:", err);
  const message = env.NODE_ENV === "production" ? "Internal server error" : err.message;
  sendError(res, 500, message, "INTERNAL_ERROR");
}
