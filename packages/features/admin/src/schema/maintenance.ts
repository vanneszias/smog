/**
 * Task 6: the maintenance setting (spec §9, ruling 9). Everything exported
 * here is part of `@smog/admin/schema` (`index.ts` re-exports this file).
 *
 * The one definition of the KV value: the site's maintenance gate
 * (`apps/site/src/worker/maintenance.ts`), `admin.maintenance.*` and
 * `bun run maintenance` all read and write it with these. Client-safe.
 */
import { LOCALES } from "@smog/config/constants";
import { z } from "zod";

/** The KV key (the site Worker's `KV` binding) of the maintenance setting. */
export const MAINTENANCE_KV_KEY = "maintenance";

/** The operator's note on the 503 page, after trimming. */
export const MAINTENANCE_MESSAGE_MAX = 280;

/** The furthest `until` the admin may announce. */
const MAINTENANCE_UNTIL_MAX_DAYS = 7;

/**
 * The version before the first window: what `POST /api/maintenance/bypass`
 * signs with while nothing is stored, and what the first `on` keeps.
 */
export const BYPASS_VERSION_INITIAL = 0;

const DAY_MS = 24 * 60 * 60 * 1000;

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

/**
 * `admin.maintenance.set`: on (with an optional note and expected end, at
 * most 7 days ahead) or off. The end is checked against the clock when the
 * input is parsed.
 */
export const maintenanceSetInputSchema = z
  .object({
    enabled: z.boolean(),
    message: z.string().trim().min(1).max(MAINTENANCE_MESSAGE_MAX).optional(),
    until: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((input, context) => {
    if (!input.enabled && (input.message ?? input.until) !== undefined) {
      context.addIssue({
        code: "custom",
        message: "message and until only go with enabled",
        path: ["enabled"],
      });
    }
    if (input.until === undefined) {
      return;
    }
    const ms = Date.parse(input.until);
    const now = Date.now();
    if (ms <= now) {
      context.addIssue({
        code: "custom",
        message: "until is in the past",
        path: ["until"],
      });
    } else if (ms > now + MAINTENANCE_UNTIL_MAX_DAYS * DAY_MS) {
      context.addIssue({
        code: "custom",
        message: `until is more than ${MAINTENANCE_UNTIL_MAX_DAYS} days ahead`,
        path: ["until"],
      });
    }
  });

export type MaintenanceSetInput = z.input<typeof maintenanceSetInputSchema>;

/*
 * The email previews (A-25, W-07): `admin.emails.*`. The template ids are
 * `@smog/email`'s; the contract checks them, so `@smog/email` stays out of
 * this client-safe file.
 */

/** One template in the preview list, with its sample subject per locale. */
export const emailTemplateSummarySchema = z.object({
  id: z.string(),
  subject: z.record(z.enum(LOCALES), z.string()),
});

export type EmailTemplateSummary = z.infer<typeof emailTemplateSummarySchema>;

/** A template rendered from its sample. */
export const emailPreviewSchema = z.object({
  html: z.string(),
  subject: z.string(),
  text: z.string(),
});

export type EmailPreview = z.infer<typeof emailPreviewSchema>;
