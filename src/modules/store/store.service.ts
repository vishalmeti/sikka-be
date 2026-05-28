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
}
