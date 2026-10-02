import type { Environment } from "@smog/config/env/worker";
import { AUDIT_TARGET_TYPES } from "@smog/db/enums";
import { z } from "zod";

/**
 * `POST /dev/e2e-seed`: the e2e's fixture writes, through the running
 * Worker (and its one D1), instead of a second `wrangler d1 execute`
 * process on the live SQLite file, which hits `SQLITE_BUSY` while the
 * specs write (review I7). A fixed list of operations with bound values,
 * never SQL from the request. Compiled out of every build but dev
 * (`__SMOG_E2E_SEED__`), refused outside `ENVIRONMENT=dev`, same-origin
 * only; the deploy guard fails a staging or production build that has it.
 */

/** The string only this endpoint's module has (the deploy guard's proof). */
export const E2E_SEED_MARKER = "smog-e2e-seed";

const email = z.email().max(254);

export const e2eSeedSchema = z.discriminatedUnion("op", [
  /** Sets a user's role (the shell spec's demotion; `admin:grant` in SQL). */
  z.object({
    email,
    op: z.literal("setRole"),
    role: z.enum(["admin", "user"]),
  }),
  /** A `legacy` audit entry by a deleted actor, dated now. */
  z.object({
    data: z.record(z.string(), z.unknown()),
    id: z.string().regex(/^e2e-[A-Za-z0-9_-]{1,60}$/),
    op: z.literal("legacyAuditEntry"),
    targetId: z.string().min(1).max(200),
    /** The `audit_log` CHECK's list (`settings` would fail with a 500). */
    targetType: z.enum(AUDIT_TARGET_TYPES),
  }),
  /** Gives a gesture a legacy (Convex) id, for the 301 test. */
  z.object({
    legacyId: z.string().regex(/^[a-z0-9]{8,64}$/),
    op: z.literal("legacyId"),
    slug: z.string().min(1).max(200),
  }),
]);

export type E2eSeed = z.infer<typeof e2eSeedSchema>;

/** Only the local dev Worker seeds (fails closed). */
export function e2eSeedEnabled(environment: Environment): boolean {
  return environment === "dev";
}

/** The one statement of a seed operation, with bound values. */
export function seedStatement(
  db: D1Database,
  seed: E2eSeed
): D1PreparedStatement {
  switch (seed.op) {
    case "setRole":
      return db
        .prepare("UPDATE user SET role = ? WHERE email = ?")
        .bind(seed.role, seed.email);
    case "legacyAuditEntry":
      return db
        .prepare(
          "INSERT OR REPLACE INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES (?, NULL, 'legacy', ?, ?, ?, CAST(unixepoch('subsec') * 1000 AS INTEGER))"
        )
        .bind(
          seed.id,
          seed.targetType,
          seed.targetId,
          JSON.stringify(seed.data)
        );
    default:
      return db
        .prepare("UPDATE gesture SET legacy_id = ? WHERE slug = ?")
        .bind(seed.legacyId, seed.slug);
  }
}
