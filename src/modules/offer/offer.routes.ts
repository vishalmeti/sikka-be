import { Router } from "express";
import { OfferController } from "./offer.controller";
import { authenticate, requireRole, validate } from "../../middleware";
import { createOfferSchema, updateOfferSchema } from "./offer.schema";

const router = Router();
const controller = new OfferController();

router.use(authenticate as any);

router.get("/store/:storeId", controller.getStoreOffers as any);
router.post("/", requireRole("owner") as any, validate(createOfferSchema), controller.create as any);
router.put("/:id", requireRole("owner") as any, validate(updateOfferSchema), controller.update as any);
router.delete("/:id", requireRole("owner") as any, controller.delete as any);

export default router;
