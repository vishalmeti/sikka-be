import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config";
import { errorHandler } from "./middleware";

import authRoutes from "./modules/auth/auth.routes";
import profileRoutes from "./modules/profile/profile.routes";
import storeRoutes from "./modules/store/store.routes";
import transactionRoutes from "./modules/transaction/transaction.routes";
import walletRoutes from "./modules/wallet/wallet.routes";
import redemptionRoutes from "./modules/redemption/redemption.routes";
import offerRoutes from "./modules/offer/offer.routes";
import notificationRoutes from "./modules/notification/notification.routes";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many requests", code: "RATE_LIMITED" } },
});
app.use("/api/", limiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/stores", storeRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/wallets", walletRoutes);
app.use("/api/redemptions", redemptionRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/notifications", notificationRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: { message: "Route not found", code: "NOT_FOUND" } });
});

app.use(errorHandler);

export default app;
