import { supabaseAdmin } from "../../config";
import { AppError, NotFoundError, ForbiddenError, ConflictError } from "../../utils/errors";

export class StoreService {
  async create(ownerId: string, data: {
    name: string;
    upiId: string;
    address?: string;
    lat?: number;
    lng?: number;
  }) {
    const { data: existing } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("upi_id", data.upiId)
      .single();

    if (existing) throw new ConflictError("A store with this UPI ID already exists");

    const { data: store, error } = await supabaseAdmin
      .from("stores")
      .insert({
        owner_id: ownerId,
        name: data.name,
        upi_id: data.upiId,
        address: data.address,
        lat: data.lat,
        lng: data.lng,
      })
      .select()
      .single();

    if (error) throw new AppError(400, error.message);
    return store;
  }

  async getById(storeId: string) {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select("*")
      .eq("id", storeId)
      .single();

    if (error || !data) throw new NotFoundError("Store");
    return data;
  }

  async getByUpiId(upiId: string) {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select("*")
      .eq("upi_id", upiId)
      .eq("is_active", true)
      .single();

    if (error || !data) throw new NotFoundError("Store");
    return data;
  }

  async getOwnerStores(ownerId: string) {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false });

    if (error) throw new AppError(400, error.message);
    return data || [];
  }

  async listActive() {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select("id, name, upi_id, address, lat, lng")
      .eq("is_active", true)
      .order("name");

    if (error) throw new AppError(400, error.message);
    return data || [];
  }

  async update(storeId: string, ownerId: string, updates: {
    name?: string;
    upiId?: string;
    address?: string;
    lat?: number;
    lng?: number;
    isActive?: boolean;
  }) {
    const store = await this.getById(storeId);
    if (store.owner_id !== ownerId) throw new ForbiddenError("You don't own this store");

    if (updates.upiId && updates.upiId !== store.upi_id) {
      const { data: existing } = await supabaseAdmin
        .from("stores")
        .select("id")
        .eq("upi_id", updates.upiId)
        .single();

      if (existing) throw new ConflictError("A store with this UPI ID already exists");

      await supabaseAdmin.from("store_upi_history").insert({
        store_id: storeId,
        old_upi_id: store.upi_id,
        new_upi_id: updates.upiId,
      });
    }

    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.upiId !== undefined) dbUpdates.upi_id = updates.upiId;
    if (updates.address !== undefined) dbUpdates.address = updates.address;
    if (updates.lat !== undefined) dbUpdates.lat = updates.lat;
    if (updates.lng !== undefined) dbUpdates.lng = updates.lng;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

    const { data: updated, error } = await supabaseAdmin
      .from("stores")
      .update(dbUpdates)
      .eq("id", storeId)
      .select()
      .single();

    if (error) throw new AppError(400, error.message);
    return updated;
  }

  async getOwnerDashboard(ownerId: string) {
    // MVP owners have a single store; use the earliest-created one.
    const { data: stores } = await supabaseAdmin
      .from("stores")
      .select("id, name")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true })
      .limit(1);

    const store = stores?.[0];
    if (!store) {
      return {
        store: null,
        todayGmv: 0,
        todayVisits: 0,
        weekVisits: [],
        weekTotal: 0,
        pendingRedemptions: { count: 0, top: null },
        activeOffer: null,
        leaderboard: [],
      };
    }

    const now = new Date();
    // Day buckets use UTC midnight boundaries (good enough for MVP; not IST-adjusted).
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const weekStart = new Date(startOfToday);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const todayKey = startOfToday.toISOString().slice(0, 10);

    const { data: weekTx } = await supabaseAdmin
      .from("transactions")
      .select("amount, created_at")
      .eq("store_id", store.id)
      .eq("status", "confirmed")
      .gte("created_at", weekStart.toISOString());

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setUTCDate(weekStart.getUTCDate() + i);
      const dateKey = d.toISOString().slice(0, 10);
      return { day: dayNames[d.getUTCDay()], count: 0, today: dateKey === todayKey, dateKey };
    });
    const bucketByKey = new Map(buckets.map((b) => [b.dateKey, b]));

    let todayGmv = 0;
    let todayVisits = 0;
    for (const tx of (weekTx as any[]) || []) {
      const key = new Date(tx.created_at).toISOString().slice(0, 10);
      const bucket = bucketByKey.get(key);
      if (bucket) bucket.count += 1;
      if (key === todayKey) {
        todayGmv += Number(tx.amount);
        todayVisits += 1;
      }
    }
    const weekVisits = buckets.map(({ day, count, today }) => ({ day, count, today }));
    const weekTotal = weekVisits.reduce((sum, b) => sum + b.count, 0);

    const { data: pending, count: pendingCount } = await supabaseAdmin
      .from("redemption_requests")
      .select("id, coins_to_redeem, rupee_value, requested_at, profiles!customer_id(name, username)", {
        count: "exact",
      })
      .eq("store_id", store.id)
      .eq("status", "pending")
      .order("requested_at", { ascending: true })
      .limit(1);

    const topPending = (pending as any[])?.[0];
    const pendingRedemptions = {
      count: pendingCount || 0,
      top: topPending
        ? {
            id: topPending.id,
            customerName: topPending.profiles?.name || topPending.profiles?.username || "Customer",
            coins: topPending.coins_to_redeem,
            rupeeValue: topPending.rupee_value,
          }
        : null,
    };

    const nowIso = now.toISOString();
    const { data: offers } = await supabaseAdmin
      .from("offers")
      .select("id, title, offer_type, ends_at")
      .eq("store_id", store.id)
      .eq("is_active", true)
      .lte("starts_at", nowIso)
      .gte("ends_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1);

    const offer = (offers as any[])?.[0];
    const activeOffer = offer
      ? { id: offer.id, title: offer.title, offerType: offer.offer_type, endsAt: offer.ends_at }
      : null;

    const { data: topWallets } = await supabaseAdmin
      .from("coin_wallets")
      .select("customer_id, balance, total_earned, tier, last_visit_date, profiles!customer_id(name, username)")
      .eq("store_id", store.id)
      .order("total_earned", { ascending: false })
      .limit(5);

    const topIds = ((topWallets as any[]) || []).map((w) => w.customer_id);
    const leaderVisits = new Map<string, number>();
    if (topIds.length) {
      const { data: leaderTx } = await supabaseAdmin
        .from("transactions")
        .select("customer_id")
        .eq("store_id", store.id)
        .eq("status", "confirmed")
        .in("customer_id", topIds);
      for (const tx of (leaderTx as any[]) || []) {
        leaderVisits.set(tx.customer_id, (leaderVisits.get(tx.customer_id) || 0) + 1);
      }
    }

    const leaderboard = ((topWallets as any[]) || []).map((w, i) => ({
      rank: i + 1,
      customerName: w.profiles?.name || w.profiles?.username || "Customer",
      coins: w.balance,
      totalEarned: w.total_earned,
      tier: w.tier,
      visits: leaderVisits.get(w.customer_id) || 0,
      lastVisitDate: w.last_visit_date,
    }));

    return {
      store: { id: store.id, name: store.name },
      todayGmv,
      todayVisits,
      weekVisits,
      weekTotal,
      pendingRedemptions,
      activeOffer,
      leaderboard,
    };
  }
}
