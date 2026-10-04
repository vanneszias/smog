import type { Environment } from "@smog/config/env/worker";
import {
  AUDIT_TARGET_TYPES,
  PAYMENT_STATUSES,
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
/** A token row: the SHA-256 the spec computed (the raw token stays there). */
const seedToken = z.object({
  expiresAt: z.number().int(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  purpose: z.enum(SPONSORSHIP_TOKEN_PURPOSES),
});

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
   * SHA-256 the spec computed (the raw token stays in the spec). A
   * `render_failed` one also gets its failed first render job (attempt 1)
   * and that job's trail, for the admin's retry (phase 7 task 7). Inserted,
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
    token: seedToken.optional(),
  }),
  /**
   * One checkout as the money path writes it, in a given state: a sponsor
   * (and an invoice request), one `initial` payment priced by the ruling 3
   * rule, and per gesture a sponsorship (ids `<id>-<n>`), its item and its
   * `created` event. The admin spec's fixtures (phase 6 task 7). Inserted,
   * never updated. With a `token`, one gesture only: the token is the
   * sponsorship's (`<id>-0`), so a paid logo can be kept through a re-edit
   * link (the kept-logo e2e, fix wave I-2).
   */
  z
    .object({
      displayName: z.string().min(1).max(35),
      /** Epoch ms (live or expiring); `starts_at` is then now. */
      endsAt: z.number().int().optional(),
      gestureSlugs: z.array(slug).min(1).max(10),
      id: fixtureId,
      invoice: z.boolean().optional(),
      logo: z.boolean().optional(),
      /** A stored logo (`logos/<uuid>`, uploaded by the spec). */
      logoKey: z
        .string()
        .regex(/^logos\/[0-9a-f-]{36}$/)
        .optional(),
      op: z.literal("sponsorshipCheckout"),
      paymentStatus: z.enum(PAYMENT_STATUSES),
      status: z.enum(SPONSORSHIP_STATUSES),
      token: seedToken.optional(),
      /** The sponsored video (a Mux playback id). */
      videoPlaybackId: z
        .string()
        .regex(/^[A-Za-z0-9]{1,64}$/)
        .optional(),
    })
    .refine((seed) => !seed.token || seed.gestureSlugs.length === 1, {
      message: "a checkout with a token has one gesture",
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

/** The stored error of a seeded failed render. */
const E2E_RENDER_ERROR = "renderer answered 500";

/**
 * `sponsorship`: its sponsor, the row, the failed first render job of a
 * `render_failed` one, and the token when asked.
 */
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
  if (seed.status === "render_failed") {
    // Its first render failed (Minor 4): a `failed` job (attempt 1, id
    // `<id>-job-1`) and the trail's `render_started` and `render_failed`,
    // so the admin can retry it (A-27).
    const jobId = `${seed.id}-job-1`;
    statements.push(
      db
        .prepare(
          `INSERT INTO render_job (id, sponsorship_id, status, workflow_instance_id, input, error, attempt, created_at, updated_at, finished_at) VALUES (?, ?, 'failed', ?, ?, ?, 1, ${NOW_MS}, ${NOW_MS}, ${NOW_MS})`
        )
        .bind(
          jobId,
          seed.id,
          jobId,
          JSON.stringify({ v: 1 }),
          E2E_RENDER_ERROR
        ),
      db
        .prepare(
          `INSERT INTO sponsorship_event (id, sponsorship_id, type, actor_id, data, created_at) VALUES (?, ?, 'render_started', NULL, ?, ${NOW_MS}), (?, ?, 'render_failed', NULL, ?, ${NOW_MS})`
        )
        .bind(
          `${jobId}-started`,
          seed.id,
          JSON.stringify({ attempt: 1, renderJobId: jobId }),
          `${jobId}-failed`,
          seed.id,
          JSON.stringify({ error: E2E_RENDER_ERROR, renderJobId: jobId })
        )
    );
  }
  if (seed.token) {
    statements.push(tokenStatement(db, seed.id, seed.token));
  }
  return statements;
}

/** The token row of a seeded sponsorship (its id is the sponsorship's). */
function tokenStatement(
  db: D1Database,
  sponsorshipId: string,
  token: z.infer<typeof seedToken>
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO sponsorship_token (id, sponsorship_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ${NOW_MS})`
    )
    .bind(
      sponsorshipId,
      sponsorshipId,
      token.purpose,
      token.hash,
      token.expiresAt
    );
}

/** One gesture's price (cents): 50 euro, plus 10 with a logo (ruling 3). */
const GESTURE_CENTS = 5000;
const LOGO_CENTS = 1000;
const LIVE_STATUSES: readonly string[] = ["live", "expiring"];

/** `sponsorshipCheckout`: the sponsor, the payment, then each gesture's rows. */
function checkoutStatements(
  db: D1Database,
  seed: Extract<E2eSeed, { op: "sponsorshipCheckout" }>
): D1PreparedStatement[] {
  const each = GESTURE_CENTS + (seed.logo ? LOGO_CENTS : 0);
  const paid = seed.paymentStatus === "paid" ? 1 : 0;
  const live = LIVE_STATUSES.includes(seed.status) ? 1 : 0;
  const statements = [
    db
      .prepare(
        `INSERT INTO sponsor (id, name, email, company, locale, created_at) VALUES (?, 'E2E Sponsor', 'e2e-sponsor@smog.test', 'E2E BV', 'nl', ${NOW_MS})`
      )
      .bind(seed.id),
  ];
  if (seed.invoice) {
    statements.push(
      db
        .prepare(
          "INSERT INTO invoice_request (sponsor_id, name, vat_number, email) VALUES (?, 'E2E BV', '0123456749', 'factuur@smog.test')"
        )
        .bind(seed.id)
    );
  }
  statements.push(
    db
      .prepare(
        `INSERT INTO payment (id, mollie_id, kind, status, amount_cents, currency, paid_at, created_at, updated_at) VALUES (?, NULL, 'initial', ?, ?, 'EUR', CASE WHEN ? = 1 THEN ${NOW_MS} END, ${NOW_MS}, ${NOW_MS})`
      )
      .bind(seed.id, seed.paymentStatus, each * seed.gestureSlugs.length, paid)
  );
  seed.gestureSlugs.forEach((gestureSlug, index) => {
    const id = `${seed.id}-${index}`;
    statements.push(
      db
        .prepare(
          `INSERT INTO sponsorship (id, sponsor_id, gesture_id, display_name, logo_key, status, starts_at, ends_at, video_playback_id, created_at, updated_at) SELECT ?, ?, g.id, ?, ?, ?, CASE WHEN ? = 1 THEN ${NOW_MS} END, ?, ?, ${NOW_MS}, ${NOW_MS} FROM gesture AS g WHERE g.slug = ?`
        )
        .bind(
          id,
          seed.id,
          seed.displayName,
          seed.logoKey ?? null,
          seed.status,
          live,
          seed.endsAt ?? null,
          seed.videoPlaybackId ?? null,
          gestureSlug
        ),
      db
        .prepare(
          "INSERT INTO payment_item (payment_id, sponsorship_id, amount_cents, includes_logo) VALUES (?, ?, ?, ?)"
        )
        .bind(seed.id, id, each, seed.logo ? 1 : 0),
      db
        .prepare(
          `INSERT INTO sponsorship_event (id, sponsorship_id, type, actor_id, data, created_at) VALUES (?, ?, 'created', NULL, ?, ${NOW_MS})`
        )
        .bind(`${id}-created`, id, JSON.stringify({ paymentId: seed.id }))
    );
  });
  if (seed.token) {
    statements.push(tokenStatement(db, `${seed.id}-0`, seed.token));
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
    case "sponsorshipCheckout":
      return checkoutStatements(db, seed);
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
