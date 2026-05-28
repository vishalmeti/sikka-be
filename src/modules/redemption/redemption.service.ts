import { supabaseAdmin, REDEEM_RATE, MAX_REDEMPTION_PERCENT } from "../../config";
import { AppError, NotFoundError, ForbiddenError, ValidationError } from "../../utils/errors";
import { PaginationParams } from "../../types";
import { paginationRange } from "../../utils/pagination";
import { NotificationService } from "../notification/notification.service";

const notificationService = new NotificationService();

export class RedemptionService {
  async create(customerId: string, storeId: string, coinsToRedeem: number, billAmount: number) {
    const { data: wallet } = await supabaseAdmin
      .from("coin_wallets")
      .select("*")
      .eq("customer_id", customerId)
      .eq("store_id", storeId)
      .single();

    if (!wallet) throw new NotFoundError("Wallet");
    if (wallet.balance < coinsToRedeem) {
      throw new ValidationError("Insufficient coin balance");
    }

    const rupeeValue = coinsToRedeem / REDEEM_RATE;
    const maxDiscount = billAmount * MAX_REDEMPTION_PERCENT;

    if (rupeeValue > maxDiscount) {
      throw new ValidationError(
        `Maximum redemption is ₹${maxDiscount.toFixed(2)} (20% of ₹${billAmount})`
      );
    }

    const { data: redemption, error } = await supabaseAdmin
      .from("redemption_requests")
      .insert({
        customer_id: customerId,
        store_id: storeId,
        coins_to_redeem: coinsToRedeem,
        rupee_value: rupeeValue,
        bill_amount: billAmount,
      })
      .select()
      .single();

    if (error) throw new AppError(400, error.message);

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("owner_id, name")
      .eq("id", storeId)
      .single();

    if (store) {
      await notificationService.create(store.owner_id, {
        title: "New Redemption Request",
        body: `A customer wants to redeem ${coinsToRedeem} coins (₹${rupeeValue}) at ${store.name}`,
        type: "redemption_requested",
        referenceId: redemption!.id,
      });
    }

    return redemption;
  }

  async resolve(redemptionId: string, ownerId: string, status: "approved" | "rejected") {
    const { data: redemption } = await supabaseAdmin
      .from("redemption_requests")
      .select("*, stores(owner_id, name)")
      .eq("id", redemptionId)
      .single();

    if (!redemption) throw new NotFoundError("Redemption request");
    if ((redemption as any).stores?.owner_id !== ownerId) {
      throw new ForbiddenError("You don't own this store");
    }
    if (redemption.status !== "pending") {
      throw new ValidationError("Request already resolved");
    }

    const { data: updated, error } = await supabaseAdmin
      .from("redemption_requests")
      .update({
        status,
        resolved_at: new Date().toISOString(),
        resolved_by: ownerId,
      })
      .eq("id", redemptionId)
      .select()
      .single();

    if (error) throw new AppError(400, error.message);

    if (status === "approved") {
      const { data: wallet } = await supabaseAdmin
        .from("coin_wallets")
        .select("*")
        .eq("customer_id", redemption.customer_id)
        .eq("store_id", redemption.store_id)
        .single();

      if (wallet) {
        await supabaseAdmin
          .from("coin_wallets")
          .update({ balance: wallet.balance - redemption.coins_to_redeem })
          .eq("id", wallet.id);
      }

      await notificationService.create(redemption.customer_id, {
        title: "Redemption Approved!",
        body: `Your ₹${redemption.rupee_value} discount at ${(redemption as any).stores?.name} was approved`,
        type: "redemption_confirmed",
        referenceId: redemptionId,
      });
    } else {
      await notificationService.create(redemption.customer_id, {
        title: "Redemption Rejected",
        body: `Your redemption request at ${(redemption as any).stores?.name} was rejected`,
        type: "redemption_rejected",
        referenceId: redemptionId,
      });
    }

    return updated;
  }

  async getCustomerRedemptions(customerId: string, pagination: PaginationParams) {
    const { from, to } = paginationRange(pagination);

    const { data, error, count } = await supabaseAdmin
      .from("redemption_requests")
      .select("*, stores(name)", { count: "exact" })
      .eq("customer_id", customerId)
      .order("requested_at", { ascending: false })
      .range(from, to);

    if (error) throw new AppError(400, error.message);

    return {
      data: data || [],
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pagination.limit),
      },
    };
  }

  async getStoreRedemptions(storeId: string, ownerId: string, pagination: PaginationParams) {
    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("id", storeId)
      .eq("owner_id", ownerId)
      .single();

    if (!store) throw new NotFoundError("Store");

    const { from, to } = paginationRange(pagination);

    const { data, error, count } = await supabaseAdmin
      .from("redemption_requests")
      .select("*, profiles!customer_id(name, phone)", { count: "exact" })
      .eq("store_id", storeId)
      .order("requested_at", { ascending: false })
      .range(from, to);

    if (error) throw new AppError(400, error.message);

    return {
      data: data || [],
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pagination.limit),
      },
    };
  }
}
