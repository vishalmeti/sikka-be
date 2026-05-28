import { supabaseAdmin } from "../../config";
import { AppError, NotFoundError } from "../../utils/errors";
import { tierProgress } from "../../utils/tier";

export class WalletService {
  async getCustomerWallets(customerId: string) {
    const { data, error } = await supabaseAdmin
      .from("coin_wallets")
      .select("*, stores(id, name)")
      .eq("customer_id", customerId)
      .order("updated_at", { ascending: false });

    if (error) throw new AppError(400, error.message);

    return (data || []).map((w: any) => ({
      id: w.id,
      storeId: w.store_id,
      storeName: w.stores?.name,
      balance: w.balance,
      totalEarned: w.total_earned,
      tier: w.tier,
      tierProgress: tierProgress(w.total_earned),
      streakDays: w.streak_days,
      lastVisitDate: w.last_visit_date,
    }));
  }

  async getWalletForStore(customerId: string, storeId: string) {
    const { data, error } = await supabaseAdmin
      .from("coin_wallets")
      .select("*, stores(id, name)")
      .eq("customer_id", customerId)
      .eq("store_id", storeId)
      .single();

    if (error || !data) throw new NotFoundError("Wallet");

    return {
      id: data.id,
      storeId: data.store_id,
      storeName: (data as any).stores?.name,
      balance: data.balance,
      totalEarned: data.total_earned,
      tier: data.tier,
      tierProgress: tierProgress(data.total_earned),
      streakDays: data.streak_days,
      lastVisitDate: data.last_visit_date,
    };
  }

  async getDashboard(customerId: string) {
    const { data: wallets } = await supabaseAdmin
      .from("coin_wallets")
      .select("balance, total_earned, streak_days, stores(name)")
      .eq("customer_id", customerId);

    const totalCoins = (wallets || []).reduce((sum: number, w: any) => sum + Number(w.balance), 0);
    const maxStreak = Math.max(0, ...(wallets || []).map((w: any) => w.streak_days));

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name")
      .eq("id", customerId)
      .single();

    const { data: recentTx } = await supabaseAdmin
      .from("transactions")
      .select("id, amount, coins_earned, status, created_at, stores(name)")
      .eq("customer_id", customerId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: recentRedemptions } = await supabaseAdmin
      .from("redemption_requests")
      .select("id, coins_to_redeem, rupee_value, status, requested_at, stores(name)")
      .eq("customer_id", customerId)
      .order("requested_at", { ascending: false })
      .limit(5);

    const activity = [
      ...(recentTx || []).map((tx: any) => ({
        id: tx.id,
        kind: "earn" as const,
        storeName: tx.stores?.name,
        coinDelta: tx.coins_earned,
        label: `₹${tx.amount} spent`,
        timestamp: tx.created_at,
      })),
      ...(recentRedemptions || []).map((r: any) => ({
        id: r.id,
        kind: "redeem" as const,
        storeName: r.stores?.name,
        coinDelta: r.coins_to_redeem,
        label: `₹${r.rupee_value} discount`,
        timestamp: r.requested_at,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      userName: profile?.name || "User",
      totalCoins,
      streakDays: maxStreak,
      stores: (wallets || []).map((w: any) => ({
        name: w.stores?.name,
        coins: w.balance,
        totalEarned: w.total_earned,
      })),
      activity: activity.slice(0, 10),
    };
  }
}
