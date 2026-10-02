/**
 * Task 6: the maintenance setting (spec §9, ruling 9). Everything exported
 * here is part of `@smog/admin/schema` (`index.ts` re-exports this file).
 *
 * The KV value itself is defined once in `@smog/config/maintenance` and
 * re-exported here; this file adds the admin's input and the email
 * preview schemas. Client-safe.
 */
import { LOCALES } from "@smog/config/constants";
import { MAINTENANCE_MESSAGE_MAX } from "@smog/config/maintenance";
import { z } from "zod";

// biome-ignore lint/performance/noBarrelFile: the setting belongs to this schema's public surface (ruling 9 names `@smog/admin/schema`).
export {
  BYPASS_VERSION_INITIAL,
  MAINTENANCE_KV_KEY,
  MAINTENANCE_MESSAGE_MAX,
  MAINTENANCE_OFF,
  type MaintenanceSetting,
  maintenanceSettingSchema,
  nextBypassVersion,
  parseMaintenanceSetting,
} from "@smog/config/maintenance";

/** The furthest `until` the admin may announce. */
const MAINTENANCE_UNTIL_MAX_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

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
