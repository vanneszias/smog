import {
  type CatalogConflictReason,
  catalogConflictDataSchema,
} from "@smog/admin/schema";

/** The oRPC error code of a failed call (`CONFLICT`, `INVALID_STATE`, …). */
export function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  return typeof error.code === "string" ? error.code : null;
}

/** Why a catalogue write was `CONFLICT` (its `data.reason`), else `null`. */
export function conflictReason(error: unknown): CatalogConflictReason | null {
  if (errorCode(error) !== "CONFLICT") {
    return null;
  }
  const { data } = error as { data?: unknown };
  const parsed = catalogConflictDataSchema.safeParse(data);
  return parsed.success ? parsed.data.reason : null;
}
