import type { Environment } from "@smog/config/env/worker";
import {
  AUDIT_TARGET_TYPES,
  SPONSORSHIP_STATUSES,
  SPONSORSHIP_TOKEN_PURPOSES,
} from "@smog/db/enums";
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
/** A catalogue slug (never SQL: it is bound, and checked). */
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
/** A fixture id: always `e2e-…`, so a seed never touches real rows. */
const fixtureId = z.string().regex(/^e2e-[A-Za-z0-9_-]{1,40}$/);

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
  /**
   * Deletes every sponsorship (with its payments, items, events, tokens
   * and jobs) on the named gestures, so the sponsor spec starts clean on
   * every run. Phase 6 task 8.
   */
  z.object({
    op: z.literal("resetSponsorships"),
    slugs: z.array(slug).min(1).max(20),
  }),
  /**
   * A read, not a write: each named gesture's sponsorships and their
   * status (`rows` in the answer), so the sponsor spec can wait for the
   * fake render's `in_review` (review I-7). Phase 6 task 8.
   */
  z.object({
    op: z.literal("sponsorshipStatus"),
    slugs: z.array(slug).min(1).max(20),
  }),
  /**
   * One sponsorship inserted in a given state (the CTA's states, the
   * re-edit link), with its own sponsor and, optionally, a token whose
   * SHA-256 the spec computed (the raw token stays in the spec). Inserted,
   * never updated: the state machine is not bypassed for real rows.
   */
  z.object({
    displayName: z.string().min(1).max(35),
    /** Epoch ms (live or expiring). */
    endsAt: z.number().int().optional(),
    gestureSlug: slug,
    id: fixtureId,
    op: z.literal("sponsorship"),
    status: z.enum(SPONSORSHIP_STATUSES),
    token: z
      .object({
        expiresAt: z.number().int(),
        hash: z.string().regex(/^[0-9a-f]{64}$/),
        purpose: z.enum(SPONSORSHIP_TOKEN_PURPOSES),
      })
      .optional(),
  }),
]);

export type E2eSeed = z.infer<typeof e2eSeedSchema>;

/** Only the local dev Worker seeds (fails closed). */
export function e2eSeedEnabled(environment: Environment): boolean {
  return environment === "dev";
}

type SingleSeed = Extract<
  E2eSeed,
  { op: "legacyAuditEntry" | "legacyId" | "setRole" }
>;

const NOW_MS = "CAST(unixepoch('subsec') * 1000 AS INTEGER)";
/** The named gestures' ids, from one bound JSON list (D1's 100 parameters). */
const GESTURES_IN =
  "SELECT id FROM gesture WHERE slug IN (SELECT value FROM json_each(?))";

/** `resetSponsorships`: the payments first (their items go with them). */
function resetStatements(
  db: D1Database,
  slugs: readonly string[]
): D1PreparedStatement[] {
  const list = JSON.stringify(slugs);
  return [
    db
      .prepare(
        `DELETE FROM payment WHERE id IN (SELECT pi.payment_id FROM payment_item AS pi JOIN sponsorship AS s ON s.id = pi.sponsorship_id WHERE s.gesture_id IN (${GESTURES_IN}))`
      )
      .bind(list),
    db
      .prepare(`DELETE FROM sponsorship WHERE gesture_id IN (${GESTURES_IN})`)
      .bind(list),
    // Their sponsors (and invoice requests) with them: none is left over.
    db.prepare(
      "DELETE FROM sponsor WHERE id NOT IN (SELECT sponsor_id FROM sponsorship)"
    ),
  ];
}

/** `sponsorship`: its sponsor, the row, and the token when asked. */
function sponsorshipStatements(
  db: D1Database,
  seed: Extract<E2eSeed, { op: "sponsorship" }>
): D1PreparedStatement[] {
  const statements = [
    db
      .prepare(
        `INSERT INTO sponsor (id, name, email, company, locale, created_at) VALUES (?, 'E2E Sponsor', 'e2e-sponsor@smog.test', NULL, 'nl', ${NOW_MS})`
      )
      .bind(seed.id),
    db
      .prepare(
        `INSERT INTO sponsorship (id, sponsor_id, gesture_id, display_name, status, starts_at, ends_at, created_at, updated_at) SELECT ?, ?, g.id, ?, ?, ${NOW_MS}, ?, ${NOW_MS}, ${NOW_MS} FROM gesture AS g WHERE g.slug = ?`
      )
      .bind(
        seed.id,
        seed.id,
        seed.displayName,
        seed.status,
        seed.endsAt ?? null,
        seed.gestureSlug
      ),
  ];
  if (seed.token) {
    statements.push(
      db
        .prepare(
          `INSERT INTO sponsorship_token (id, sponsorship_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ${NOW_MS})`
        )
        .bind(
          seed.id,
          seed.id,
          seed.token.purpose,
          seed.token.hash,
          seed.token.expiresAt
        )
    );
  }
  return statements;
}

/** The statements of any seed operation, in order, with bound values. */
export function seedStatements(
  db: D1Database,
  seed: E2eSeed
): D1PreparedStatement[] {
  switch (seed.op) {
    case "resetSponsorships":
      return resetStatements(db, seed.slugs);
    case "sponsorship":
      return sponsorshipStatements(db, seed);
    case "sponsorshipStatus":
      return [
        db
          .prepare(
            "SELECT g.slug, s.status FROM sponsorship AS s JOIN gesture AS g ON g.id = s.gesture_id WHERE g.slug IN (SELECT value FROM json_each(?)) ORDER BY g.slug"
          )
          .bind(JSON.stringify(seed.slugs)),
      ];
    default:
      return [seedStatement(db, seed)];
  }
}

/** The one statement of a single-statement seed operation, with bound values. */
export function seedStatement(
  db: D1Database,
  seed: SingleSeed
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
