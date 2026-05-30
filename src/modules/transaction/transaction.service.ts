import crypto from "crypto";
import { query, queryOne, queryCount, withTx, EARN_RATE, STREAK_BONUSES } from "../../config";
import { env } from "../../config/env";
import { AppError, NotFoundError, ConflictError } from "../../utils/errors";
import { computeTier } from "../../utils/tier";
import { PaginationParams } from "../../types";
import { NotificationService } from "../notification/notification.service";

const notificationService = new NotificationService();

interface PendingTx {
  id: string;
  customer_id: string;
  store_id: string;
  amount: string;
}

interface Wallet {
  id: string;
  balance: string;
  total_earned: string;
  streak_days: number;
  last_visit_date: string | null;
}

export class TransactionService {
  async createOrder(customerId: string, storeId: string, amount: number) {
    const store = await queryOne<{ id: string; name: string }>(
      "SELECT id, name FROM stores WHERE id = $1 AND is_active = true",
      [storeId],
    );
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

    await query(
      `INSERT INTO transactions
         (customer_id, store_id, amount, coins_earned, razorpay_order_id, razorpay_payment_id, status)
       VALUES ($1, $2, $3, 0, $4, $5, 'pending')`,
      [customerId, storeId, amount, order.id, `pending_${order.id}`],
    );

    return { orderId: order.id, amount: order.amount, currency: order.currency };
  }

  async verifyPayment(
    customerId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ) {
    const expectedSignature = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      throw new AppError(400, "Invalid payment signature");
    }

    const existingTx = await queryOne<{ id: string }>(
      "SELECT id FROM transactions WHERE razorpay_payment_id = $1",
      [razorpayPaymentId],
    );
    if (existingTx) throw new ConflictError("Payment already processed");

    const pendingTx = await queryOne<PendingTx>(
      `SELECT id, customer_id, store_id, amount FROM transactions
       WHERE razorpay_order_id = $1 AND status = 'pending'
       LIMIT 1`,
      [razorpayOrderId],
    );
    if (!pendingTx) throw new NotFoundError("Pending transaction");

    const coinsEarned = await this.calculateCoins(pendingTx.store_id, Number(pendingTx.amount));

    const transaction = await queryOne(
      `UPDATE transactions
       SET razorpay_payment_id = $2, coins_earned = $3, status = 'confirmed'
       WHERE id = $1
       RETURNING *`,
      [pendingTx.id, razorpayPaymentId, coinsEarned],
    );

    await this.creditCoins(customerId, pendingTx.store_id, coinsEarned);

    const store = await queryOne<{ name: string }>(
      "SELECT name FROM stores WHERE id = $1",
      [pendingTx.store_id],
    );

    await notificationService.create(customerId, {
      title: "Coins Earned!",
      body: `You earned ${coinsEarned} coins at ${store?.name ?? "the store"}`,
      type: "coins_earned",
      referenceId: (transaction as { id: string }).id,
    });

    return transaction;
  }

  async getCustomerTransactions(customerId: string, pagination: PaginationParams) {
    const offset = (pagination.page - 1) * pagination.limit;
    const data = await query(
      `SELECT t.*, json_build_object('name', s.name) AS stores
       FROM transactions t
       JOIN stores s ON s.id = t.store_id
       WHERE t.customer_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [customerId, pagination.limit, offset],
    );

    const total = await queryCount(
      "SELECT COUNT(*)::text AS count FROM transactions WHERE customer_id = $1",
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

  async getStoreTransactions(storeId: string, ownerId: string, pagination: PaginationParams) {
    const store = await queryOne<{ id: string }>(
      "SELECT id FROM stores WHERE id = $1 AND owner_id = $2",
      [storeId, ownerId],
    );
    if (!store) throw new NotFoundError("Store");

    const offset = (pagination.page - 1) * pagination.limit;
    const data = await query(
      `SELECT t.*, json_build_object('name', p.name, 'username', p.username) AS profiles
       FROM transactions t
       JOIN profiles p ON p.id = t.customer_id
       WHERE t.store_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [storeId, pagination.limit, offset],
    );

    const total = await queryCount(
      "SELECT COUNT(*)::text AS count FROM transactions WHERE store_id = $1",
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

  private async calculateCoins(storeId: string, amount: number): Promise<number> {
    let coins = Math.floor(amount * EARN_RATE);

    const now = new Date().toISOString();
    const activeOffer = await queryOne<{
      offer_type: string;
      multiplier: string;
      bonus_amount: string;
      min_spend: string;
    }>(
      `SELECT offer_type, multiplier, bonus_amount, min_spend FROM offers
       WHERE store_id = $1 AND is_active = true AND starts_at <= $2 AND ends_at >= $2
       LIMIT 1`,
      [storeId, now],
    );

    if (activeOffer) {
      const multiplier = Number(activeOffer.multiplier);
      const bonus = Number(activeOffer.bonus_amount);
      const minSpend = Number(activeOffer.min_spend);
      switch (activeOffer.offer_type) {
        case "double_coins":
          coins = Math.floor(coins * multiplier);
          break;
        case "bonus_coins":
          coins += bonus;
          break;
        case "spend_and_earn":
          if (amount >= minSpend) coins += bonus;
          break;
      }
    }

    return coins;
  }

  private async creditCoins(customerId: string, storeId: string, coins: number) {
    await withTx(async (client) => {
      const walletRes = await client.query<Wallet>(
        "SELECT id, balance, total_earned, streak_days, last_visit_date FROM coin_wallets WHERE customer_id = $1 AND store_id = $2 FOR UPDATE",
        [customerId, storeId],
      );
      const wallet = walletRes.rows[0];
      const today = new Date().toISOString().slice(0, 10);

      if (wallet) {
        let streakDays = wallet.streak_days;
        let bonusCoins = 0;

        if (wallet.last_visit_date) {
          const last = new Date(wallet.last_visit_date);
          const t = new Date(today);
          const diff = Math.floor((t.getTime() - last.getTime()) / 86400000);
          if (diff === 1) streakDays += 1;
          else if (diff > 1) streakDays = 1;
        } else {
          streakDays = 1;
        }

        if (STREAK_BONUSES[streakDays]) {
          bonusCoins = STREAK_BONUSES[streakDays];
          // Defer notification until after the tx commits so a rollback
          // doesn't leave a phantom "streak bonus" in the user's feed.
          setImmediate(() => {
            notificationService
              .create(customerId, {
                title: "Streak Bonus!",
                body: `${streakDays}-day streak! You earned ${bonusCoins} bonus coins`,
                type: "streak_bonus",
              })
              .catch((e) => console.error("Streak notification failed:", e));
          });
        }

        const newTotalEarned = Number(wallet.total_earned) + coins + bonusCoins;
        const newBalance = Number(wallet.balance) + coins + bonusCoins;
        const newTier = computeTier(newTotalEarned);

        await client.query(
          `UPDATE coin_wallets
           SET balance = $2, total_earned = $3, streak_days = $4, last_visit_date = $5, tier = $6
           WHERE id = $1`,
          [wallet.id, newBalance, newTotalEarned, streakDays, today, newTier],
        );
      } else {
        const newTier = computeTier(coins);
        await client.query(
          `INSERT INTO coin_wallets
             (customer_id, store_id, balance, total_earned, streak_days, last_visit_date, tier)
           VALUES ($1, $2, $3, $4, 1, $5, $6)`,
          [customerId, storeId, coins, coins, today, newTier],
        );
      }
    });
  }
}
