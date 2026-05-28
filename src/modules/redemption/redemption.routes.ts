import { Router } from "express";
import { RedemptionController } from "./redemption.controller";
import { authenticate, requireRole, validate } from "../../middleware";
import { createRedemptionSchema, resolveRedemptionSchema } from "./redemption.schema";

const router = Router();
const controller = new RedemptionController();

router.use(authenticate as any);

router.post("/", requireRole("customer") as any, validate(createRedemptionSchema), controller.create as any);
router.get("/", controller.getMyRedemptions as any);
router.get("/store/:storeId", requireRole("owner") as any, controller.getStoreRedemptions as any);
router.put("/:id", requireRole("owner") as any, validate(resolveRedemptionSchema), controller.resolve as any);

export default router;
