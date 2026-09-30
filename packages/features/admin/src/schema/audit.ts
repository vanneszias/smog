/**
 * The audit log's shapes (spec §5.3, ruling 5): `audit_log.data` per
 * action, the entry every admin screen shows, and the list filters.
 * Client-safe: the enums come from `@smog/db/enums` (no tables, no Drizzle).
 */
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  type AuditAction,
} from "@smog/db/enums";
import { z } from "zod";

// biome-ignore lint/performance/noBarrelFile: the audit enums belong to this schema's public surface (client-safe).
export {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  type AuditAction,
  type AuditTargetType,
} from "@smog/db/enums";

type AuditSchemaBlock = Partial<Record<AuditAction, z.ZodType>>;

/*
 * One block per area. Each task adds its actions to its own block only, so
 * parallel tasks never edit the same lines. An action without a schema
 * cannot be written (`WritableAuditAction`).
 */

/** Migrated Convex `adminLogs` rows whose shape is not known (spec §15). */
const LEGACY_AUDIT_SCHEMAS = {
  legacy: z.object({ legacy: z.unknown() }),
} satisfies AuditSchemaBlock;

/** Task 2: `gesture.*` and `category.*`. */
const CATALOG_AUDIT_SCHEMAS = {} satisfies AuditSchemaBlock;

/** Task 5: `user.*`. */
const USER_AUDIT_SCHEMAS = {} satisfies AuditSchemaBlock;

/** Task 6: `maintenance.*`. */
const MAINTENANCE_AUDIT_SCHEMAS = {} satisfies AuditSchemaBlock;

/**
 * `audit_log.data` per action. The writer validates `data` with it before
 * any write, and `admin.audit.list` parses stored rows with it. Phase 6
 * adds the sponsorship, payment and export actions.
 */
export const AUDIT_DATA_SCHEMAS = {
  ...LEGACY_AUDIT_SCHEMAS,
  ...CATALOG_AUDIT_SCHEMAS,
  ...USER_AUDIT_SCHEMAS,
  ...MAINTENANCE_AUDIT_SCHEMAS,
} satisfies AuditSchemaBlock;

/** The actions the writer accepts: those with a `data` schema. */
export type WritableAuditAction = keyof typeof AUDIT_DATA_SCHEMAS;

/** What `data` must look like for `action` (before parsing). */
export type AuditData<A extends WritableAuditAction> = z.input<
  (typeof AUDIT_DATA_SCHEMAS)[A]
>;

/** The `data` schema of an action, if it has one. */
export function auditDataSchema(action: AuditAction): z.ZodType | undefined {
  return (AUDIT_DATA_SCHEMAS as AuditSchemaBlock)[action];
}

export const auditActionSchema = z.enum(AUDIT_ACTIONS);
export const auditTargetTypeSchema = z.enum(AUDIT_TARGET_TYPES);

/** One audit entry as the admin screens show it. */
export const auditEntrySchema = z.object({
  action: auditActionSchema,
  /** `null` once the acting account is deleted (the row stays). */
  actor: z.object({ id: z.string(), name: z.string() }).nullable(),
  /** Epoch milliseconds. */
  createdAt: z.number().int(),
  /** Parsed with the action's schema when it has one, else as stored. */
  data: z.unknown(),
  id: z.string(),
  /** `null` for `system` actions with no single target. */
  targetId: z.string().nullable(),
  targetType: auditTargetTypeSchema,
});

export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const AUDIT_PAGE_MAX = 100;
export const AUDIT_PAGE_DEFAULT = 50;

const idSchema = z.string().min(1).max(200);

export const auditListInputSchema = z
  .object({
    action: auditActionSchema.optional(),
    actorId: idSchema.optional(),
    cursor: z.string().min(1).max(1024).optional(),
    /** Epoch milliseconds, inclusive. */
    from: z.number().int().nonnegative().optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(AUDIT_PAGE_MAX)
      .default(AUDIT_PAGE_DEFAULT),
    targetId: idSchema.optional(),
    targetType: auditTargetTypeSchema.optional(),
    /** Epoch milliseconds, inclusive. */
    to: z.number().int().nonnegative().optional(),
  })
  .refine((input) => !(input.from && input.to) || input.from <= input.to, {
    message: "from must not be after to",
    path: ["to"],
  });

export type AuditListInput = z.input<typeof auditListInputSchema>;
/** The list input after defaults (`limit` set). */
export type AuditListQuery = z.output<typeof auditListInputSchema>;

export const auditPageSchema = z.object({
  items: z.array(auditEntrySchema),
  /** Pass as `cursor` for the next (older) page; `null` on the last. */
  nextCursor: z.string().nullable(),
});

export type AuditPage = z.infer<typeof auditPageSchema>;

/** The actors the audit log has entries for (the actor filter). */
export const auditActorsSchema = z.array(
  z.object({ id: z.string(), name: z.string() })
);

export type AuditActor = z.infer<typeof auditActorsSchema>[number];

/** At most this many actors in the filter (admins are few). */
export const AUDIT_ACTORS_MAX = 100;
