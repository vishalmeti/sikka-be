import { Response } from "express";
import { PaginatedResponse } from "../types";

export function sendSuccess<T>(res: Response, data: T, statusCode = 200) {
  res.status(statusCode).json({ success: true, data });
}

export function sendPaginated<T>(res: Response, result: PaginatedResponse<T>) {
  res.status(200).json({ success: true, ...result });
}

export function sendError(res: Response, statusCode: number, message: string, code?: string) {
  res.status(statusCode).json({ success: false, error: { message, code } });
}
