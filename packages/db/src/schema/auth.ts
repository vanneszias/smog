/**
 * Better Auth tables (spec §5.1): core schema plus the admin plugin
 * (`role`, `banned`, `banReason`, `banExpires`, `impersonatedBy`) and the
 * passkey plugin (`passkey`), and our own `locale`, `legacyId` and
 * `welcomedAt` (server-only).
 *
 * Written by hand from Better Auth's documented schema (the shape its CLI
 * generates for SQLite: snake_case columns, `timestamp_ms` dates); phase 2
 * Task 2 checks it against the CLI output. The TS keys are Better Auth's
 * field names, which its Drizzle adapter maps by.
 */
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { LOCALES, ROLES } from "../enums";
import { createdAt, inValues, timestamp, updatedAt } from "./columns";

/**
 * Migration 0007 adds the `user_keep_one_admin` trigger to this table
 * (`BEFORE UPDATE OF role`: a role change never leaves the site without an
 * admin whose ban is not in force). drizzle-kit does not model triggers,
 * so a generated migration that rebuilds `user` (`__new_user`, `DROP
 * TABLE`, `RENAME`, e.g. for a changed CHECK or column type) silently drops
 * it: such a migration must re-create the trigger in the same file (copy
 * 0007's statement), never by editing 0007. `last-admin.test.ts` in
 * `@smog/admin` applies every migration and fails without it. The Convex
 * import must not demote through an upsert either (PROGRESS, phase 8).
 */
export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    image: text("image"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    role: text("role", { enum: ROLES }).notNull().default("user"),
    banned: integer("banned", { mode: "boolean" }).default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires"),
    locale: text("locale", { enum: LOCALES }),
    legacyId: text("legacy_id").unique(),
    /**
     * When the welcome email was claimed (migration 0012, phase 8 ruling
     * 16): `welcome()` sets it with a guarded `UPDATE … WHERE welcomed_at
     * IS NULL` and enqueues only when it won. Server-only: not a Better
     * Auth additional field, so no client sees or sets it. The Convex
     * import sets it, so a migrated user is never welcomed.
     */
    welcomedAt: timestamp("welcomed_at"),
  },
  (t) => [
    check("user_role_check", inValues(t.role, ROLES)),
    check("user_locale_check", inValues(t.locale, LOCALES)),
    index("user_created_at_idx").on(t.createdAt),
  ]
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (t) => [
    index("session_user_id_idx").on(t.userId),
    // The daily retention purge seeks expired rows (migration 0008).
    index("session_expires_at_idx").on(t.expiresAt),
  ]
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("account_user_id_idx").on(t.userId),
    index("account_provider_account_idx").on(t.providerId, t.accountId),
  ]
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("verification_identifier_idx").on(t.identifier),
    // The daily retention purge seeks expired rows (migration 0008).
    index("verification_expires_at_idx").on(t.expiresAt),
  ]
);

export const passkey = sqliteTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at"),
    aaguid: text("aaguid"),
  },
  (t) => [
    index("passkey_user_id_idx").on(t.userId),
    index("passkey_credential_id_idx").on(t.credentialID),
  ]
);
