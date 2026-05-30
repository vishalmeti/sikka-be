import {
  query,
  queryOne,
  queryCount,
  withTx,
  REDEEM_RATE,
  MAX_REDEMPTION_PERCENT,
} from "../../config";
import { AppError, NotFoundError, ForbiddenError, ValidationError } from "../../utils/errors";
import { PaginationParams } from "../../types";
import { NotificationService } from "../notification/notification.service";

const notificationService = new NotificationService();

interface RedemptionRow {
  id: string;
  customer_id: string;
  store_id: string;
  coins_to_redeem: string;
  rupee_value: string;
  bill_amount: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export class RedemptionService {
  async create(customerId: string, storeId: string, coinsToRedeem: number, billAmount: number) {
    const wallet = await queryOne<{ id: string; balance: string }>(
      "SELECT id, balance FROM coin_wallets WHERE customer_id = $1 AND store_id = $2",
      [customerId, storeId],
    );

    if (!wallet) throw new NotFoundError("Wallet");
    if (Number(wallet.balance) < coinsToRedeem) {
      throw new ValidationError("Insufficient coin balance");
    }

    const rupeeValue = coinsToRedeem / REDEEM_RATE;
    const maxDiscount = billAmount * MAX_REDEMPTION_PERCENT;

    if (rupeeValue > maxDiscount) {
      throw new ValidationError(
        `Maximum redemption is ₹${maxDiscount.toFixed(2)} (20% of ₹${billAmount})`,
      );
    }

    const redemption = (await queryOne<RedemptionRow>(
      `INSERT INTO redemption_requests
         (customer_id, store_id, coins_to_redeem, rupee_value, bill_amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [customerId, storeId, coinsToRedeem, rupeeValue, billAmount],
    ))!;

    const store = await queryOne<{ owner_id: string; name: string }>(
      "SELECT owner_id, name FROM stores WHERE id = $1",
      [storeId],
    );

    if (store) {
      await notificationService.create(store.owner_id, {
        title: "New Redemption Request",
        body: `A customer wants to redeem ${coinsToRedeem} coins (₹${rupeeValue}) at ${store.name}`,
        type: "redemption_requested",
        referenceId: redemption.id,
      });
    }

    return redemption;
  }

  async resolve(redemptionId: string, ownerId: string, status: "approved" | "rejected") {
    const redemption = await queryOne<RedemptionRow & { store_owner_id: string; store_name: string }>(
      `SELECT r.*, s.owner_id AS store_owner_id, s.name AS store_name
       FROM redemption_requests r
       JOIN stores s ON s.id = r.store_id
       WHERE r.id = $1`,
      [redemptionId],
    );

    if (!redemption) throw new NotFoundError("Redemption request");
    if (redemption.store_owner_id !== ownerId) {
      throw new ForbiddenError("You don't own this store");
    }
    if (redemption.status !== "pending") {
      throw new ValidationError("Request already resolved");
    }

    const updated = await withTx(async (client) => {
      const updRes = await client.query<RedemptionRow>(
        `UPDATE redemption_requests
         SET status = $2, resolved_at = now(), resolved_by = $3
         WHERE id = $1
         RETURNING *`,
        [redemptionId, status, ownerId],
      );

      if (status === "approved") {
        // Locking the wallet row prevents a concurrent earn from racing with the debit.
        const walletRes = await client.query<{ id: string; balance: string }>(
          "SELECT id, balance FROM coin_wallets WHERE customer_id = $1 AND store_id = $2 FOR UPDATE",
          [redemption.customer_id, redemption.store_id],
        );
        const wallet = walletRes.rows[0];
        if (wallet) {
          const newBalance = Number(wallet.balance) - Number(redemption.coins_to_redeem);
          if (newBalance < 0) throw new ValidationError("Insufficient coin balance");
          await client.query("UPDATE coin_wallets SET balance = $2 WHERE id = $1", [
            wallet.id,
            newBalance,
          ]);
        }
      }

      return updRes.rows[0];
    });

    if (status === "approved") {
      await notificationService.create(redemption.customer_id, {
        title: "Redemption Approved!",
        body: `Your ₹${redemption.rupee_value} discount at ${redemption.store_name} was approved`,
        type: "redemption_confirmed",
        referenceId: redemptionId,
      });
    } else {
      await notificationService.create(redemption.customer_id, {
        title: "Redemption Rejected",
        body: `Your redemption request at ${redemption.store_name} was rejected`,
        type: "redemption_rejected",
        referenceId: redemptionId,
      });
    }

    return updated;
  }

  async getCustomerRedemptions(customerId: string, pagination: PaginationParams) {
    const offset = (pagination.page - 1) * pagination.limit;
    const data = await query(
      `SELECT r.*, json_build_object('name', s.name) AS stores
       FROM redemption_requests r
       LEFT JOIN stores s ON s.id = r.store_id
       WHERE r.customer_id = $1
       ORDER BY r.requested_at DESC
       LIMIT $2 OFFSET $3`,
      [customerId, pagination.limit, offset],
    );

    const total = await queryCount(
      "SELECT COUNT(*)::text AS count FROM redemption_requests WHERE customer_id = $1",
      [customerId],
    );

    return {
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async getStoreRedemptions(storeId: string, ownerId: string, pagination: PaginationParams) {
    const store = await queryOne<{ id: string }>(
      "SELECT id FROM stores WHERE id = $1 AND owner_id = $2",
      [storeId, ownerId],
    );
    if (!store) throw new NotFoundError("Store");

    const offset = (pagination.page - 1) * pagination.limit;
    const data = await query(
      `SELECT r.*, json_build_object('name', p.name, 'username', p.username) AS profiles
       FROM redemption_requests r
       JOIN profiles p ON p.id = r.customer_id
       WHERE r.store_id = $1
       ORDER BY r.requested_at DESC
       LIMIT $2 OFFSET $3`,
      [storeId, pagination.limit, offset],
    );

    const total = await queryCount(
      "SELECT COUNT(*)::text AS count FROM redemption_requests WHERE store_id = $1",
      [storeId],
    );

    return {
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }
}
