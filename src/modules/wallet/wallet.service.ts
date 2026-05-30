import { query, queryOne, REDEEM_RATE } from "../../config";
import { NotFoundError } from "../../utils/errors";
import { tierProgress } from "../../utils/tier";

interface WalletRow {
  id: string;
  store_id: string;
  store_name: string | null;
  balance: string;
  total_earned: string;
  tier: string;
  streak_days: number;
  last_visit_date: string | null;
}

export class WalletService {
  async getCustomerWallets(customerId: string) {
    const rows = await query<WalletRow>(
      `SELECT w.id, w.store_id, s.name AS store_name, w.balance, w.total_earned,
              w.tier, w.streak_days, w.last_visit_date
       FROM coin_wallets w
       LEFT JOIN stores s ON s.id = w.store_id
       WHERE w.customer_id = $1
       ORDER BY w.updated_at DESC`,
      [customerId],
    );

    return rows.map((w) => ({
      id: w.id,
      storeId: w.store_id,
      storeName: w.store_name,
      balance: Number(w.balance),
      totalEarned: Number(w.total_earned),
      tier: w.tier,
      tierProgress: tierProgress(Number(w.total_earned)),
      streakDays: w.streak_days,
      lastVisitDate: w.last_visit_date,
    }));
  }

  async getWalletForStore(customerId: string, storeId: string) {
    const data = await queryOne<WalletRow>(
      `SELECT w.id, w.store_id, s.name AS store_name, w.balance, w.total_earned,
              w.tier, w.streak_days, w.last_visit_date
       FROM coin_wallets w
       LEFT JOIN stores s ON s.id = w.store_id
       WHERE w.customer_id = $1 AND w.store_id = $2`,
      [customerId, storeId],
    );

    if (!data) throw new NotFoundError("Wallet");

    return {
      id: data.id,
      storeId: data.store_id,
      storeName: data.store_name,
      balance: Number(data.balance),
      totalEarned: Number(data.total_earned),
      tier: data.tier,
      tierProgress: tierProgress(Number(data.total_earned)),
      streakDays: data.streak_days,
      lastVisitDate: data.last_visit_date,
    };
  }

  async getDashboard(customerId: string) {
    const wallets = await query<{
      store_id: string;
      store_name: string | null;
      balance: string;
      total_earned: string;
      tier: string;
      streak_days: number;
      visits: string;
    }>(
      `SELECT w.store_id, s.name AS store_name, w.balance, w.total_earned,
              w.tier, w.streak_days,
              COALESCE((
                SELECT COUNT(*) FROM transactions t
                WHERE t.customer_id = w.customer_id
                  AND t.store_id = w.store_id
                  AND t.status = 'confirmed'
              ), 0)::text AS visits
       FROM coin_wallets w
       LEFT JOIN stores s ON s.id = w.store_id
       WHERE w.customer_id = $1
       ORDER BY w.balance DESC`,
      [customerId],
    );

    const totalCoins = wallets.reduce((sum, w) => sum + Number(w.balance), 0);
    const totalEarned = wallets.reduce((sum, w) => sum + Number(w.total_earned), 0);
    const maxStreak = wallets.reduce((m, w) => Math.max(m, w.streak_days), 0);

    const profile = await queryOne<{ name: string | null }>(
      "SELECT name FROM profiles WHERE id = $1",
      [customerId],
    );

    const recentTx = await query<{
      id: string;
      amount: string;
      coins_earned: string;
      status: string;
      created_at: string;
      store_name: string | null;
    }>(
      `SELECT t.id, t.amount, t.coins_earned, t.status, t.created_at, s.name AS store_name
       FROM transactions t
       LEFT JOIN stores s ON s.id = t.store_id
       WHERE t.customer_id = $1 AND t.status = 'confirmed'
       ORDER BY t.created_at DESC
       LIMIT 10`,
      [customerId],
    );

    const recentRedemptions = await query<{
      id: string;
      coins_to_redeem: string;
      rupee_value: string;
      status: string;
      requested_at: string;
      store_name: string | null;
    }>(
      `SELECT r.id, r.coins_to_redeem, r.rupee_value, r.status, r.requested_at, s.name AS store_name
       FROM redemption_requests r
       LEFT JOIN stores s ON s.id = r.store_id
       WHERE r.customer_id = $1
       ORDER BY r.requested_at DESC
       LIMIT 5`,
      [customerId],
    );

    const activity = [
      ...recentTx.map((tx) => ({
        id: tx.id,
        kind: "earn" as const,
        storeName: tx.store_name,
        coinDelta: Number(tx.coins_earned),
        label: `₹${tx.amount} spent`,
        timestamp: tx.created_at,
      })),
      ...recentRedemptions.map((r) => ({
        id: r.id,
        kind: "redeem" as const,
        storeName: r.store_name,
        coinDelta: Number(r.coins_to_redeem),
        label: `₹${r.rupee_value} discount`,
        timestamp: r.requested_at,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      userName: profile?.name || "User",
      totalCoins,
      totalEarned,
      overallProgress: tierProgress(totalEarned),
      redeemRate: REDEEM_RATE,
      streakDays: maxStreak,
      stores: wallets.map((w) => ({
        id: w.store_id,
        name: w.store_name,
        coins: Number(w.balance),
        totalEarned: Number(w.total_earned),
        tier: w.tier,
        tierProgress: tierProgress(Number(w.total_earned)),
        visits: Number(w.visits),
      })),
      activity: activity.slice(0, 10),
    };
  }
}
