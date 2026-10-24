/**
 * The drawing upload and the drawing card (phase 10c task 3, spec 5.2): one
 * PNG or JPEG per gesture and step, at most 512 KiB and 1,200 px on a
 * side (a WebP cannot be embedded in the PDF), uploaded with a presigned PUT and then finalized (the server reads
 * the object and checks its bytes). Client-safe. **Private material:** the
 * image is served only by `GET /api/teacher/drawings/<gestureId>/<step>`.
 */
import { DRAWING_UPLOAD_MAX_BYTES } from "@smog/db/enums";
import { z } from "zod";
import {
  drawingCreditSchema,
  drawingKeySchema,
  drawingRowSchema,
  drawingStepSchema,
  drawingUploadTypeSchema,
} from "./teacher";

/** The private route a drawing is served from (`?v=` is the change stamp that renews the browser's 5-minute copy). */
export function drawingPath(
  gestureId: string,
  step: number,
  updatedAt?: number
): string {
  const base = `/api/teacher/drawings/${gestureId}/${step}`;
  return updatedAt === undefined ? base : `${base}?v=${updatedAt}`;
}

export const drawingUploadInputSchema = z.object({
  contentType: drawingUploadTypeSchema,
  gestureId: z.uuid(),
  size: z.number().int().min(1).max(DRAWING_UPLOAD_MAX_BYTES),
  step: drawingStepSchema,
});
export type DrawingUploadInput = z.infer<typeof drawingUploadInputSchema>;

/** A PUT the browser makes itself, with exactly these headers. */
export const drawingUploadResultSchema = z.object({
  /** Epoch ms after which the URL no longer works. */
  expiresAt: z.number().int(),
  headers: z.object({ "content-type": drawingUploadTypeSchema }),
  key: drawingKeySchema,
  uploadUrl: z.url(),
});
export type DrawingUploadResult = z.infer<typeof drawingUploadResultSchema>;

export const drawingFinalizeInputSchema = z.object({
  credit: drawingCreditSchema,
  gestureId: z.uuid(),
  key: drawingKeySchema,
  step: drawingStepSchema,
});
export type DrawingFinalizeInput = z.infer<typeof drawingFinalizeInputSchema>;

/** Why a finalize refuses (`VALIDATION`, field `file`). */
export const DRAWING_REFUSALS = [
  "missing",
  "tooLarge",
  "format",
  "dimensions",
  "key",
] as const;
export type DrawingRefusal = (typeof DRAWING_REFUSALS)[number];

export const drawingListInputSchema = z.object({ gestureId: z.uuid() });
export const drawingListSchema = z.object({ items: z.array(drawingRowSchema) });
export type DrawingList = z.infer<typeof drawingListSchema>;

export const drawingDeleteInputSchema = z.object({
  gestureId: z.uuid(),
  step: drawingStepSchema,
});
export const drawingDeleteResultSchema = z.object({ deleted: z.boolean() });
