import { query, queryOne, queryCount, withTx } from "../../config";
import { AppError, NotFoundError, ForbiddenError, ConflictError } from "../../utils/errors";

interface StoreRow {
  id: string;
  owner_id: string;
  name: string;
  upi_id: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export class StoreService {
  async create(
    ownerId: string,
    data: { name: string; upiId: string; address?: string; lat?: number; lng?: number },
  ) {
    try {
      return (await queryOne<StoreRow>(
        `INSERT INTO stores (owner_id, name, upi_id, address, lat, lng)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [ownerId, data.name, data.upiId, data.address ?? null, data.lat ?? null, data.lng ?? null],
      ))!;
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === "23505") {
        throw new ConflictError("A store with this UPI ID already exists");
      }
      throw new AppError(400, (err as Error).message);
    }
  }

  async getById(storeId: string): Promise<StoreRow> {
    const store = await queryOne<StoreRow>("SELECT * FROM stores WHERE id = $1", [storeId]);
    if (!store) throw new NotFoundError("Store");
    return store;
  }

  async getByUpiId(upiId: string) {
    const store = await queryOne<StoreRow>(
      "SELECT * FROM stores WHERE upi_id = $1 AND is_active = true",
      [upiId],
    );
    if (!store) throw new NotFoundError("Store");
    return store;
  }

  async getOwnerStores(ownerId: string) {
    return query<StoreRow>(
      "SELECT * FROM stores WHERE owner_id = $1 ORDER BY created_at DESC",
      [ownerId],
    );
  }

  async listActive() {
    return query(
      `SELECT id, name, upi_id, address, lat, lng
       FROM stores WHERE is_active = true
       ORDER BY name`,
    );
  }

  async update(
    storeId: string,
    ownerId: string,
    updates: {
      name?: string;
      upiId?: string;
      address?: string;
      lat?: number;
      lng?: number;
      isActive?: boolean;
    },
  ) {
    const store = await this.getById(storeId);
    if (store.owner_id !== ownerId) throw new ForbiddenError("You don't own this store");

    return withTx(async (client) => {
      if (updates.upiId && updates.upiId !== store.upi_id) {
        const dup = await client.query<{ id: string }>(
          "SELECT id FROM stores WHERE upi_id = $1 AND id <> $2",
          [updates.upiId, storeId],
        );
        if (dup.rowCount && dup.rowCount > 0) {
          throw new ConflictError("A store with this UPI ID already exists");
        }
        await client.query(
          "INSERT INTO store_upi_history (store_id, old_upi_id, new_upi_id) VALUES ($1, $2, $3)",
          [storeId, store.upi_id, updates.upiId],
        );
      }

      // Build a dynamic SET clause from only the fields that were provided.
      const sets: string[] = [];
      const values: unknown[] = [];
      const push = (col: string, val: unknown) => {
        values.push(val);
        sets.push(`${col} = $${values.length}`);
      };
      if (updates.name !== undefined) push("name", updates.name);
      if (updates.upiId !== undefined) push("upi_id", updates.upiId);
      if (updates.address !== undefined) push("address", updates.address);
      if (updates.lat !== undefined) push("lat", updates.lat);
      if (updates.lng !== undefined) push("lng", updates.lng);
      if (updates.isActive !== undefined) push("is_active", updates.isActive);

      if (sets.length === 0) return store;

      values.push(storeId);
      const result = await client.query<StoreRow>(
        `UPDATE stores SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
        values,
      );
      return result.rows[0];
    });
  }

  async getOwnerDashboard(ownerId: string) {
    // MVP owners have a single store; use the earliest-created one.
    const store = await queryOne<{ id: string; name: string }>(
      "SELECT id, name FROM stores WHERE owner_id = $1 ORDER BY created_at ASC LIMIT 1",
      [ownerId],
    );

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
    // Day buckets use UTC midnight (good enough for MVP; not IST-adjusted).
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const weekStart = new Date(startOfToday);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const todayKey = startOfToday.toISOString().slice(0, 10);

    const weekTx = await query<{ amount: string; created_at: string }>(
      `SELECT amount, created_at FROM transactions
       WHERE store_id = $1 AND status = 'confirmed' AND created_at >= $2`,
      [store.id, weekStart.toISOString()],
    );

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
    for (const tx of weekTx) {
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

    const pendingCount = await queryCount(
      "SELECT COUNT(*)::text AS count FROM redemption_requests WHERE store_id = $1 AND status = 'pending'",
      [store.id],
    );
    const topPending = await queryOne<{
      id: string;
      coins_to_redeem: string;
      rupee_value: string;
      name: string | null;
      username: string;
    }>(
      `SELECT r.id, r.coins_to_redeem, r.rupee_value, p.name, p.username
       FROM redemption_requests r
       JOIN profiles p ON p.id = r.customer_id
       WHERE r.store_id = $1 AND r.status = 'pending'
       ORDER BY r.requested_at ASC
       LIMIT 1`,
      [store.id],
    );

    const pendingRedemptions = {
      count: pendingCount,
      top: topPending
        ? {
            id: topPending.id,
            customerName: topPending.name || topPending.username || "Customer",
            coins: Number(topPending.coins_to_redeem),
            rupeeValue: Number(topPending.rupee_value),
          }
        : null,
    };

    const nowIso = now.toISOString();
    const offer = await queryOne<{
      id: string;
      title: string;
      offer_type: string;
      ends_at: string;
    }>(
      `SELECT id, title, offer_type, ends_at FROM offers
       WHERE store_id = $1 AND is_active = true AND starts_at <= $2 AND ends_at >= $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [store.id, nowIso],
    );
    const activeOffer = offer
      ? { id: offer.id, title: offer.title, offerType: offer.offer_type, endsAt: offer.ends_at }
      : null;

    const topWallets = await query<{
      customer_id: string;
      balance: string;
      total_earned: string;
      tier: string;
      last_visit_date: string | null;
      name: string | null;
      username: string;
      visits: string;
    }>(
      `SELECT w.customer_id, w.balance, w.total_earned, w.tier, w.last_visit_date,
              p.name, p.username,
              COALESCE((
                SELECT COUNT(*) FROM transactions t
                WHERE t.store_id = w.store_id
                  AND t.customer_id = w.customer_id
                  AND t.status = 'confirmed'
              ), 0)::text AS visits
       FROM coin_wallets w
       JOIN profiles p ON p.id = w.customer_id
       WHERE w.store_id = $1
       ORDER BY w.total_earned DESC
       LIMIT 5`,
      [store.id],
    );

    const leaderboard = topWallets.map((w, i) => ({
      rank: i + 1,
      customerName: w.name || w.username || "Customer",
      coins: Number(w.balance),
      totalEarned: Number(w.total_earned),
      tier: w.tier,
      visits: Number(w.visits),
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
