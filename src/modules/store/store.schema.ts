import { z } from "zod";

export const createStoreSchema = z.object({
  name: z.string().min(2).max(200),
  upiId: z.string().min(3).max(100),
  address: z.string().max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const updateStoreSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  upiId: z.string().min(3).max(100).optional(),
  address: z.string().max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  isActive: z.boolean().optional(),
});
