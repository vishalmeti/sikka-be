import { query, queryOne } from "../../config";
import { AppError, NotFoundError, ForbiddenError } from "../../utils/errors";

interface OfferRow {
  id: string;
  store_id: string;
  title: string;
  offer_type: string;
  multiplier: string;
  bonus_amount: string;
  min_spend: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
}

export class OfferService {
  async create(
    ownerId: string,
    data: {
      storeId: string;
      title: string;
      offerType: string;
      multiplier: number;
      bonusAmount: number;
      minSpend: number;
      startsAt: string;
      endsAt: string;
    },
  ) {
    await this.verifyStoreOwnership(data.storeId, ownerId);

    try {
      return (await queryOne<OfferRow>(
        `INSERT INTO offers
           (store_id, title, offer_type, multiplier, bonus_amount, min_spend, starts_at, ends_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          data.storeId,
          data.title,
          data.offerType,
          data.multiplier,
          data.bonusAmount,
          data.minSpend,
          data.startsAt,
          data.endsAt,
        ],
      ))!;
    } catch (err: unknown) {
      throw new AppError(400, (err as Error).message);
    }
  }

  async update(offerId: string, ownerId: string, updates: Record<string, unknown>) {
    const offer = await queryOne<OfferRow & { store_owner_id: string }>(
      `SELECT o.*, s.owner_id AS store_owner_id
       FROM offers o JOIN stores s ON s.id = o.store_id
       WHERE o.id = $1`,
      [offerId],
    );
    if (!offer) throw new NotFoundError("Offer");
    if (offer.store_owner_id !== ownerId) throw new ForbiddenError("You don't own this store");

    const sets: string[] = [];
    const values: unknown[] = [];
    const push = (col: string, val: unknown) => {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    };
    if (updates.title !== undefined) push("title", updates.title);
    if (updates.multiplier !== undefined) push("multiplier", updates.multiplier);
    if (updates.bonusAmount !== undefined) push("bonus_amount", updates.bonusAmount);
    if (updates.minSpend !== undefined) push("min_spend", updates.minSpend);
    if (updates.startsAt !== undefined) push("starts_at", updates.startsAt);
    if (updates.endsAt !== undefined) push("ends_at", updates.endsAt);
    if (updates.isActive !== undefined) push("is_active", updates.isActive);

    if (sets.length === 0) return offer;

    values.push(offerId);
    const updated = await queryOne<OfferRow>(
      `UPDATE offers SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    return updated;
  }

  async delete(offerId: string, ownerId: string) {
    const offer = await queryOne<{ store_owner_id: string }>(
      `SELECT s.owner_id AS store_owner_id
       FROM offers o JOIN stores s ON s.id = o.store_id
       WHERE o.id = $1`,
      [offerId],
    );
    if (!offer) throw new NotFoundError("Offer");
    if (offer.store_owner_id !== ownerId) throw new ForbiddenError("You don't own this store");

    await query("DELETE FROM offers WHERE id = $1", [offerId]);
    return { message: "Offer deleted" };
  }

  async getStoreOffers(storeId: string, activeOnly = false) {
    if (activeOnly) {
      const now = new Date().toISOString();
      return query<OfferRow>(
        `SELECT * FROM offers
         WHERE store_id = $1 AND is_active = true AND starts_at <= $2 AND ends_at >= $2
         ORDER BY created_at DESC`,
        [storeId, now],
      );
    }
    return query<OfferRow>(
      "SELECT * FROM offers WHERE store_id = $1 ORDER BY created_at DESC",
      [storeId],
    );
  }

  private async verifyStoreOwnership(storeId: string, ownerId: string) {
    const store = await queryOne(
      "SELECT id FROM stores WHERE id = $1 AND owner_id = $2",
      [storeId, ownerId],
    );
    if (!store) throw new ForbiddenError("You don't own this store");
  }
}
