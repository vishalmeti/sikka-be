import { supabaseAdmin } from "../../config";
import { AppError, NotFoundError, ForbiddenError } from "../../utils/errors";

export class OfferService {
  async create(ownerId: string, data: {
    storeId: string;
    title: string;
    offerType: string;
    multiplier: number;
    bonusAmount: number;
    minSpend: number;
    startsAt: string;
    endsAt: string;
  }) {
    await this.verifyStoreOwnership(data.storeId, ownerId);

    const { data: offer, error } = await supabaseAdmin
      .from("offers")
      .insert({
        store_id: data.storeId,
        title: data.title,
        offer_type: data.offerType,
        multiplier: data.multiplier,
        bonus_amount: data.bonusAmount,
        min_spend: data.minSpend,
        starts_at: data.startsAt,
        ends_at: data.endsAt,
      })
      .select()
      .single();

    if (error) throw new AppError(400, error.message);
    return offer;
  }

  async update(offerId: string, ownerId: string, updates: Record<string, unknown>) {
    const { data: offer } = await supabaseAdmin
      .from("offers")
      .select("*, stores(owner_id)")
      .eq("id", offerId)
      .single();

    if (!offer) throw new NotFoundError("Offer");
    if ((offer as any).stores?.owner_id !== ownerId) throw new ForbiddenError("You don't own this store");

    const dbUpdates: Record<string, unknown> = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.multiplier !== undefined) dbUpdates.multiplier = updates.multiplier;
    if (updates.bonusAmount !== undefined) dbUpdates.bonus_amount = updates.bonusAmount;
    if (updates.minSpend !== undefined) dbUpdates.min_spend = updates.minSpend;
    if (updates.startsAt !== undefined) dbUpdates.starts_at = updates.startsAt;
    if (updates.endsAt !== undefined) dbUpdates.ends_at = updates.endsAt;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

    const { data: updated, error } = await supabaseAdmin
      .from("offers")
      .update(dbUpdates)
      .eq("id", offerId)
      .select()
      .single();

    if (error) throw new AppError(400, error.message);
    return updated;
  }

  async delete(offerId: string, ownerId: string) {
    const { data: offer } = await supabaseAdmin
      .from("offers")
      .select("*, stores(owner_id)")
      .eq("id", offerId)
      .single();

    if (!offer) throw new NotFoundError("Offer");
    if ((offer as any).stores?.owner_id !== ownerId) throw new ForbiddenError("You don't own this store");

    const { error } = await supabaseAdmin.from("offers").delete().eq("id", offerId);
    if (error) throw new AppError(400, error.message);

    return { message: "Offer deleted" };
  }

  async getStoreOffers(storeId: string, activeOnly = false) {
    let query = supabaseAdmin
      .from("offers")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });

    if (activeOnly) {
      const now = new Date().toISOString();
      query = query
        .eq("is_active", true)
        .lte("starts_at", now)
        .gte("ends_at", now);
    }

    const { data, error } = await query;
    if (error) throw new AppError(400, error.message);
    return data || [];
  }

  private async verifyStoreOwnership(storeId: string, ownerId: string) {
    const { data } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("id", storeId)
      .eq("owner_id", ownerId)
      .single();

    if (!data) throw new ForbiddenError("You don't own this store");
  }
}
