import { Router } from "express";
import { StoreController } from "./store.controller";
import { authenticate, requireRole, validate } from "../../middleware";
import { createStoreSchema, updateStoreSchema } from "./store.schema";

const router = Router();
const controller = new StoreController();

router.use(authenticate as any);

router.get("/", controller.listActive as any);
router.get("/my", requireRole("owner") as any, controller.getMyStores as any);
router.get("/lookup/:upiId", controller.getByUpiId as any);
router.get("/:id", controller.getById as any);
router.post("/", requireRole("owner") as any, validate(createStoreSchema), controller.create as any);
router.put("/:id", requireRole("owner") as any, validate(updateStoreSchema), controller.update as any);

export default router;
