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
import { GESTURE_PATCH_FIELDS } from "./catalog";

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
 * cannot be written (`WritableAuditAction`), and neither can `legacy`.
 */

/**
 * Migrated Convex `adminLogs` rows whose shape is not known (spec §15).
 * Read-only: parsed on read, never written (its `{ legacy: unknown }` would
 * bypass the per-action schemas and their data minimisation).
 */
const LEGACY_AUDIT_SCHEMAS = {
  legacy: z.object({ legacy: z.unknown() }),
} satisfies AuditSchemaBlock;

/** A catalogue row's name and slug when the entry was written. */
const catalogTarget = z.object({ name: z.string(), slug: z.string() });

/**
 * Task 2: `gesture.*` and `category.*`. One entry per target, except the
 * set actions (`gesture.bulk_update`, `category.reorder`): one entry with
 * `target_id` NULL and the ids in `data`.
 */
const CATALOG_AUDIT_SCHEMAS = {
  "category.create": catalogTarget.extend({ published: z.boolean() }),
  "category.delete": catalogTarget,
  "category.publish": catalogTarget,
  "category.reorder": z.object({ ids: z.array(z.string()) }),
  "category.unpublish": catalogTarget,
  "category.update": catalogTarget.extend({ previousName: z.string() }),
  "gesture.bulk_update": z.object({
    ids: z.array(z.string()).min(1),
    patch: z.object({
      addCategoryIds: z.array(z.string()).optional(),
      published: z.boolean().optional(),
      removeCategoryIds: z.array(z.string()).optional(),
    }),
  }),
  "gesture.create": catalogTarget.extend({ published: z.boolean() }),
  "gesture.delete": catalogTarget,
  "gesture.publish": catalogTarget,
  "gesture.unpublish": catalogTarget,
  "gesture.update": catalogTarget.extend({
    /** The fields the update changed. */
    fields: z.array(z.enum(GESTURE_PATCH_FIELDS)).min(1),
    /** Set when the name changed. */
    previousName: z.string().optional(),
  }),
} satisfies AuditSchemaBlock;

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

/** Actions that are parsed on read but never written. */
export const READ_ONLY_AUDIT_ACTIONS = [
  "legacy",
] as const satisfies readonly AuditAction[];

/** The actions the writer accepts: those with a `data` schema, except `legacy`. */
export type WritableAuditAction = Exclude<
  keyof typeof AUDIT_DATA_SCHEMAS,
  (typeof READ_ONLY_AUDIT_ACTIONS)[number]
>;

/** Whether the writer accepts `action` (it has a schema and is not read-only). */
export function isWritableAuditAction(
  action: string
): action is WritableAuditAction {
  return (
    Object.hasOwn(AUDIT_DATA_SCHEMAS, action) &&
    !(READ_ONLY_AUDIT_ACTIONS as readonly string[]).includes(action)
  );
}

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
  })
  // `(target_type, target_id, created_at)` cannot be sought by the id alone.
  .refine((input) => !input.targetId || input.targetType, {
    message: "targetId needs targetType",
    path: ["targetType"],
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

/**
 * The actor filter's choices: every admin and every account with audit
 * entries, by name, at most `AUDIT_ACTORS_MAX` (`truncated` says so).
 */
export const auditActorsSchema = z.object({
  actors: z.array(z.object({ id: z.string(), name: z.string() })),
  truncated: z.boolean(),
});

export type AuditActor = z.infer<typeof auditActorsSchema>["actors"][number];

/** At most this many actors in the filter (admins are few). */
export const AUDIT_ACTORS_MAX = 100;
