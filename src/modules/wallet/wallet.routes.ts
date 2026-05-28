import { Router } from "express";
import { WalletController } from "./wallet.controller";
import { authenticate, requireRole } from "../../middleware";

const router = Router();
const controller = new WalletController();

router.use(authenticate as any);

router.get("/", requireRole("customer") as any, controller.getMyWallets as any);
router.get("/dashboard", requireRole("customer") as any, controller.getDashboard as any);
router.get("/:storeId", requireRole("customer") as any, controller.getWalletForStore as any);

export default router;
