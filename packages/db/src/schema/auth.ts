/**
 * Better Auth tables (spec §5.1): core schema plus the admin plugin
 * (`role`, `banned`, `banReason`, `banExpires`, `impersonatedBy`) and the
 * passkey plugin (`passkey`), and our own `locale` and `legacyId`.
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

export const user = sqliteTable(
  "user",
  {
    banExpires: timestamp("ban_expires"),
    banned: integer("banned", { mode: "boolean" }).default(false),
    banReason: text("ban_reason"),
    createdAt: createdAt(),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    id: text("id").primaryKey(),
    image: text("image"),
    legacyId: text("legacy_id").unique(),
    locale: text("locale", { enum: LOCALES }),
    name: text("name").notNull(),
    role: text("role", { enum: ROLES }).notNull().default("user"),
    updatedAt: updatedAt(),
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
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at").notNull(),
    id: text("id").primaryKey(),
    impersonatedBy: text("impersonated_by"),
    ipAddress: text("ip_address"),
    token: text("token").notNull().unique(),
    updatedAt: updatedAt(),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)]
);

export const account = sqliteTable(
  "account",
  {
    accessToken: text("access_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    accountId: text("account_id").notNull(),
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    idToken: text("id_token"),
    password: text("password"),
    providerId: text("provider_id").notNull(),
    refreshToken: text("refresh_token"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    updatedAt: updatedAt(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("account_user_id_idx").on(t.userId),
    index("account_provider_account_idx").on(t.providerId, t.accountId),
  ]
);

export const verification = sqliteTable(
  "verification",
  {
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at").notNull(),
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    updatedAt: updatedAt(),
    value: text("value").notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)]
);

export const passkey = sqliteTable(
  "passkey",
  {
    aaguid: text("aaguid"),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
    counter: integer("counter").notNull(),
    createdAt: timestamp("created_at"),
    credentialID: text("credential_id").notNull(),
    deviceType: text("device_type").notNull(),
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    transports: text("transports"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("passkey_user_id_idx").on(t.userId),
    index("passkey_credential_id_idx").on(t.credentialID),
  ]
);
