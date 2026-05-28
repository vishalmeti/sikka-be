import { Router } from "express";
import { TransactionController } from "./transaction.controller";
import { authenticate, requireRole, validate } from "../../middleware";
import { createOrderSchema, verifyPaymentSchema } from "./transaction.schema";

const router = Router();
const controller = new TransactionController();

router.use(authenticate as any);

router.post("/order", requireRole("customer") as any, validate(createOrderSchema), controller.createOrder as any);
router.post("/verify", requireRole("customer") as any, validate(verifyPaymentSchema), controller.verifyPayment as any);
router.get("/", controller.getMyTransactions as any);
router.get("/store/:storeId", requireRole("owner") as any, controller.getStoreTransactions as any);

export default router;
