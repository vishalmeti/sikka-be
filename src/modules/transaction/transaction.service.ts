import crypto from "crypto";
import { supabaseAdmin, EARN_RATE, STREAK_BONUSES } from "../../config";
import { env } from "../../config/env";
import { AppError, NotFoundError, ConflictError } from "../../utils/errors";
import { computeTier } from "../../utils/tier";
import { PaginationParams } from "../../types";
import { paginationRange } from "../../utils/pagination";
import { NotificationService } from "../notification/notification.service";

const notificationService = new NotificationService();

export class TransactionService {
  async createOrder(customerId: string, storeId: string, amount: number) {
    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id, name")
      .eq("id", storeId)
      .eq("is_active", true)
      .single();

    if (!store) throw new NotFoundError("Store");

    const Razorpay = (await import("razorpay")).default;
    const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      notes: { customer_id: customerId, store_id: storeId },
    });

    await supabaseAdmin.from("transactions").insert({
      customer_id: customerId,
      store_id: storeId,
      amount,
      coins_earned: 0,
      razorpay_order_id: order.id,
      razorpay_payment_id: `pending_${order.id}`,
      status: "pending",
    });

    return { orderId: order.id, amount: order.amount, currency: order.currency };
  }

  async verifyPayment(
    customerId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string
  ) {
    const expectedSignature = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      throw new AppError(400, "Invalid payment signature");
    }

    const { data: existingTx } = await supabaseAdmin
      .from("transactions")
      .select("id")
      .eq("razorpay_payment_id", razorpayPaymentId)
      .single();

    if (existingTx) throw new ConflictError("Payment already processed");

    const { data: pendingTx } = await supabaseAdmin
      .from("transactions")
      .select("*")
      .eq("razorpay_order_id", razorpayOrderId)
      .eq("status", "pending")
      .single();

    if (!pendingTx) throw new NotFoundError("Pending transaction");

    const coinsEarned = await this.calculateCoins(pendingTx.store_id, pendingTx.amount);

    const { data: transaction, error } = await supabaseAdmin
      .from("transactions")
      .update({
        razorpay_payment_id: razorpayPaymentId,
        coins_earned: coinsEarned,
        status: "confirmed",
      })
      .eq("id", pendingTx.id)
      .select()
      .single();

    if (error) throw new AppError(400, error.message);

    await this.creditCoins(customerId, pendingTx.store_id, coinsEarned);

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("name")
      .eq("id", pendingTx.store_id)
      .single();

    await notificationService.create(customerId, {
      title: "Coins Earned!",
      body: `You earned ${coinsEarned} coins at ${store?.name}`,
      type: "coins_earned",
      referenceId: transaction!.id,
    });

    return transaction;
  }

  async getCustomerTransactions(customerId: string, pagination: PaginationParams) {
    const { from, to } = paginationRange(pagination);

    const { data, error, count } = await supabaseAdmin
      .from("transactions")
      .select("*, stores(name)", { count: "exact" })
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
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

  async getStoreTransactions(storeId: string, ownerId: string, pagination: PaginationParams) {
    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("id", storeId)
      .eq("owner_id", ownerId)
      .single();

    if (!store) throw new NotFoundError("Store");

    const { from, to } = paginationRange(pagination);

    const { data, error, count } = await supabaseAdmin
      .from("transactions")
      .select("*, profiles!customer_id(name, phone)", { count: "exact" })
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
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

  private async calculateCoins(storeId: string, amount: number): Promise<number> {
    let coins = Math.floor(amount * EARN_RATE);

    const now = new Date();
    const { data: activeOffer } = await supabaseAdmin
      .from("offers")
      .select("*")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .lte("starts_at", now.toISOString())
      .gte("ends_at", now.toISOString())
      .limit(1)
      .single();

    if (activeOffer) {
      switch (activeOffer.offer_type) {
        case "double_coins":
          coins = Math.floor(coins * activeOffer.multiplier);
          break;
        case "bonus_coins":
          coins += activeOffer.bonus_amount;
          break;
        case "spend_and_earn":
          if (amount >= activeOffer.min_spend) {
            coins += activeOffer.bonus_amount;
          }
          break;
      }
    }

    return coins;
  }

  private async creditCoins(customerId: string, storeId: string, coins: number) {
    const { data: wallet } = await supabaseAdmin
      .from("coin_wallets")
      .select("*")
      .eq("customer_id", customerId)
      .eq("store_id", storeId)
      .single();

    const today = new Date().toISOString().split("T")[0];

    if (wallet) {
      const lastVisit = wallet.last_visit_date;
      let streakDays = wallet.streak_days;
      let bonusCoins = 0;

      if (lastVisit) {
        const lastDate = new Date(lastVisit);
        const todayDate = new Date(today);
        const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / 86400000);

        if (diffDays === 1) {
          streakDays += 1;
        } else if (diffDays > 1) {
          streakDays = 1;
        }
      } else {
        streakDays = 1;
      }

      if (STREAK_BONUSES[streakDays]) {
        bonusCoins = STREAK_BONUSES[streakDays];
        await notificationService.create(customerId, {
          title: "Streak Bonus!",
          body: `${streakDays}-day streak! You earned ${bonusCoins} bonus coins`,
          type: "streak_bonus",
        });
      }

      const newTotalEarned = wallet.total_earned + coins + bonusCoins;
      const newTier = computeTier(newTotalEarned);

      await supabaseAdmin
        .from("coin_wallets")
        .update({
          balance: wallet.balance + coins + bonusCoins,
          total_earned: newTotalEarned,
          streak_days: streakDays,
          last_visit_date: today,
          tier: newTier,
        })
        .eq("id", wallet.id);
    } else {
      const newTier = computeTier(coins);
      await supabaseAdmin.from("coin_wallets").insert({
        customer_id: customerId,
        store_id: storeId,
        balance: coins,
        total_earned: coins,
        streak_days: 1,
        last_visit_date: today,
        tier: newTier,
      });
    }
  }
}
