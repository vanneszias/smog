import {
  ASSET_STATUSES,
  MUX_ASSETS_PAGE_MAX,
  UPLOAD_STATUSES,
} from "@smog/video/schema";
import { z } from "zod";

/**
 * `admin.mux.*`: Mux direct uploads and the asset picker (ruling 4). The
 * states come from `@smog/video/schema` (client-safe; the Mux client
 * itself never reaches a browser bundle).
 */

/** The asset picker's default page size. */
export const MUX_ASSETS_PAGE_DEFAULT = 12;

export const muxUploadStatusSchema = z.enum(UPLOAD_STATUSES);
export type MuxUploadStatus = z.infer<typeof muxUploadStatusSchema>;

export const muxAssetStatusSchema = z.enum(ASSET_STATUSES);
export type MuxAssetStatus = z.infer<typeof muxAssetStatusSchema>;

export const muxStatusSchema = z.object({
  /** Mux credentials are set: uploads and the picker work. */
  configured: z.boolean(),
});
export type MuxStatus = z.infer<typeof muxStatusSchema>;

export const muxCreatedUploadSchema = z.object({
  uploadId: z.string(),
  /** The signed URL the browser PUTs the file to (never through the Worker). */
  url: z.url(),
});
export type MuxCreatedUpload = z.infer<typeof muxCreatedUploadSchema>;

/** Mux ids: letters, digits, `_` and `-`. */
const muxIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, "invalid id");

export const muxUploadStatusInputSchema = z.object({ uploadId: muxIdSchema });

export const muxUploadProgressSchema = z.object({
  asset: z
    .object({
      id: z.string(),
      playbackId: z.string().optional(),
      status: muxAssetStatusSchema,
    })
    .optional(),
  /** Mux's own message (shown as a detail under the translated one). */
  error: z.string().optional(),
  upload: muxUploadStatusSchema,
});
export type MuxUploadProgress = z.infer<typeof muxUploadProgressSchema>;

export const muxAssetsInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(MUX_ASSETS_PAGE_MAX)
    .default(MUX_ASSETS_PAGE_DEFAULT),
  page: z.number().int().min(1).max(10_000).default(1),
});
export type MuxAssetsInput = z.input<typeof muxAssetsInputSchema>;

export const muxAssetItemSchema = z.object({
  aspectRatio: z.string().nullable(),
  /** Milliseconds since the epoch. */
  createdAt: z.number(),
  duration: z.number().nullable(),
  id: z.string(),
  playbackId: z.string(),
  status: muxAssetStatusSchema,
  /** The gestures that use the asset (by `mux_asset_id` or `playback_id`). */
  usedBy: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type MuxAssetItem = z.infer<typeof muxAssetItemSchema>;

export const muxAssetsPageSchema = z.object({
  hasMore: z.boolean(),
  items: z.array(muxAssetItemSchema),
  page: z.number().int(),
});
export type MuxAssetsPage = z.infer<typeof muxAssetsPageSchema>;
