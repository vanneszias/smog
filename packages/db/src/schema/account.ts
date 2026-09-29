/** Account, consent and audit tables (spec §5.3). */
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  CONSENT_PURPOSES,
  CONSENT_SOURCES,
} from "../enums";
import { user } from "./auth";
import { createdAt, inValues } from "./columns";

/** Append-only: the current state is the newest row per purpose. */
export const consentEvent = sqliteTable(
  "consent_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: CONSENT_PURPOSES }).notNull(),
    granted: integer("granted", { mode: "boolean" }).notNull(),
    policyVersion: text("policy_version").notNull(),
    source: text("source", { enum: CONSENT_SOURCES }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("consent_event_purpose_check", inValues(t.purpose, CONSENT_PURPOSES)),
    check("consent_event_source_check", inValues(t.source, CONSENT_SOURCES)),
    index("consent_event_user_purpose_created_idx").on(
      t.userId,
      t.purpose,
      t.createdAt
    ),
  ]
);

/** `data` is validated per `action` by `@smog/admin/schema`. */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    action: text("action", { enum: AUDIT_ACTIONS }).notNull(),
    targetType: text("target_type", { enum: AUDIT_TARGET_TYPES }).notNull(),
    /** NULL for `system` actions that have no single target. */
    targetId: text("target_id"),
    data: text("data", { mode: "json" }).$type<unknown>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("audit_log_action_check", inValues(t.action, AUDIT_ACTIONS)),
    check(
      "audit_log_target_type_check",
      inValues(t.targetType, AUDIT_TARGET_TYPES)
    ),
    index("audit_log_created_at_idx").on(t.createdAt),
    index("audit_log_target_idx").on(t.targetType, t.targetId),
    index("audit_log_action_created_idx").on(t.action, t.createdAt),
    index("audit_log_actor_id_idx").on(t.actorId),
  ]
);
