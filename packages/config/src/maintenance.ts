/**
 * The maintenance setting (spec §9, phase 5 ruling 9): the one definition
 * of the site Worker's KV value `maintenance`. The gate
 * (`apps/site/src/worker/maintenance.ts`), `admin.maintenance.*` (through
 * `@smog/admin/schema`, which re-exports this) and `bun run maintenance`
 * read and write it with these. A runtime-wide setting, so it lives here
 * and not in a feature. Client-safe.
 *
 * KV is eventually consistent: a write is read back at once at the same
 * location (usually), other locations see it within about a minute, and a
 * read with `cacheTtl` may be that many seconds old. Nothing here is a
 * "fresh" read.
 */
import { z } from "zod";

/** The KV key (the site Worker's `KV` binding) of the maintenance setting. */
export const MAINTENANCE_KV_KEY = "maintenance";

/** The operator's note on the 503 page, after trimming. */
export const MAINTENANCE_MESSAGE_MAX = 280;

/**
 * The version before the first window: what `POST /api/maintenance/bypass`
 * signs with while nothing is stored, and what the first `on` keeps.
 * Deleting the key resets the version to this (cookies signed for it work
 * again); turn maintenance off instead.
 */
export const BYPASS_VERSION_INITIAL = 0;

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "not a date");

/** The stored KV value. */
export const maintenanceSettingSchema = z.object({
  /**
   * A bypass cookie is valid only for the version it was signed with. It
   * changes only when maintenance is turned off (`nextBypassVersion`).
   */
  bypassVersion: z.int(),
  enabled: z.boolean(),
  /** The operator's note, shown under the page text (plain text). */
  message: z.string().optional(),
  /** ISO 8601: the expected end (the page and `Retry-After`). */
  until: dateString.optional(),
});

export type MaintenanceSetting = z.infer<typeof maintenanceSettingSchema>;

/** The setting when nothing is stored: off, the first version. */
export const MAINTENANCE_OFF: MaintenanceSetting = {
  bypassVersion: BYPASS_VERSION_INITIAL,
  enabled: false,
};

/** The KV value, or null when it is missing or malformed (then: off). */
export function parseMaintenanceSetting(
  raw: string | null
): MaintenanceSetting | null {
  if (raw === null) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = maintenanceSettingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The version to write. Turning on keeps the current one, so a bypass
 * cookie an admin fetched before the window (or earlier in it) keeps
 * working; turning off starts a new one (the current second, always above
 * the old value), which voids every cookie of the window that just ended.
 */
export function nextBypassVersion(
  enabled: boolean,
  current: number | null,
  now: number = Date.now()
): number {
  if (enabled) {
    return current ?? BYPASS_VERSION_INITIAL;
  }
  return Math.max(Math.floor(now / 1000), (current ?? 0) + 1);
}
