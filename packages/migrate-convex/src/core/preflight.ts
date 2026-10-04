/**
 * `apply`'s preflight and verification (phase 8 ruling 14), as pure
 * functions over a read-only query. The CLI runs them through `wrangler d1
 * execute --command` (`src/cli/apply.ts`); the integration suite runs the
 * same code against a D1 with every migration.
 *
 * - `preflight.json` (written by `plan`) holds the facts a check needs:
 *   the addresses the users file claims, the emitted slugs, share tokens
 *   and Mollie ids. Like the SQL, it is personal data (`out/`).
 * - `runPreflight` refuses when the migrations are below 0012, when
 *   (staging, production) maintenance is not on, when an emitted slug,
 *   share token or Mollie id belongs to a row of another origin, when an
 *   emitted address belongs to an account that another legacy id claimed
 *   (task 7 review M-2), or when the import would leave no admin. It
 *   lists the accounts that will be claimed and reports, never changes, a
 *   claimed account whose role differs from Convex's.
 * - `verifyCounts` compares the report's counts with D1's after the
 *   files ran.
 *
 * Every value goes into the SQL through `sqlLiteral` (inside `json_each`),
 * and every list is chunked so one command stays far below the shell's
 * argument limit.
 */
import { parseMaintenanceSetting } from "@smog/config/maintenance";
import { z } from "zod";
import { sqlLiteral } from "./emit";
import type { Report } from "./report";
import type { Target } from "./target";

/** The last migration `apply` needs (0012: `user.welcomed_at`). */
export const REQUIRED_MIGRATION = 12;
/**
 * Values per `json_each` list in one preflight query. Kept at 300 (task 10
 * review M-6): D1 refuses a SQL statement over 100 KB, and an address may
 * be 254 characters (plus its JSON quotes and comma), so 1000 addresses
 * could reach about 260 KB, while 300 stay under about 80 KB.
 */
export const PREFLIGHT_CHUNK = 300;

export const APPLY_ENVS = ["dev", "staging", "production"] as const;
export type ApplyEnv = (typeof APPLY_ENVS)[number];

export function isApplyEnv(value: string): value is ApplyEnv {
  return (APPLY_ENVS as readonly string[]).includes(value);
}

const roleSchema = z.enum(["user", "admin"]);

/** What `plan` writes to `preflight.json`. */
export const preflightFactsSchema = z.strictObject({
  /** Every address the users file names, as emitted. */
  claims: z.array(
    z.strictObject({
      email: z.string(),
      legacyId: z.string(),
      role: roleSchema,
    })
  ),
  /** The emitted payments with a Mollie id. */
  mollieIds: z.array(z.strictObject({ id: z.string(), mollieId: z.string() })),
  /**
   * What `apply` checks the manifest and `report.json` against (task 10
   * review I-2): the plan's target, its blocker count and the SHA-256 of
   * `report.json`. This file is hashed in the manifest, so editing the
   * manifest's target or blockers, or the report, is caught.
   */
  plan: z.strictObject({
    blockers: z.number().int().nonnegative(),
    reportSha256: z.string().regex(/^[0-9a-f]{64}$/),
    target: z.enum(["staging", "production"]),
  }),
  /** The emitted share tokens. */
  shareTokens: z.array(z.strictObject({ id: z.string(), token: z.string() })),
  /** The emitted slugs of categories and gestures. */
  slugs: z.array(
    z.strictObject({
      legacyId: z.string(),
      slug: z.string(),
      table: z.enum(["category", "gesture"]),
    })
  ),
  version: z.literal(1),
});
export type PreflightFacts = z.infer<typeof preflightFactsSchema>;

/** What one transform adds to `preflight.json`. */
export type PreflightPart = Partial<Omit<PreflightFacts, "plan" | "version">>;

function byText<T>(key: (item: T) => string): (a: T, b: T) => number {
  return (a, b) => {
    const left = key(a);
    const right = key(b);
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  };
}

/** The transforms' parts in one, sorted, so the file is byte-identical for the same inputs. */
export function mergePreflight(
  parts: readonly PreflightPart[],
  planFacts: PreflightFacts["plan"]
): PreflightFacts {
  return {
    claims: parts
      .flatMap((part) => part.claims ?? [])
      .sort(byText((item) => `${item.email}\u0000${item.legacyId}`)),
    mollieIds: parts
      .flatMap((part) => part.mollieIds ?? [])
      .sort(byText((item) => `${item.mollieId}\u0000${item.id}`)),
    plan: planFacts,
    shareTokens: parts
      .flatMap((part) => part.shareTokens ?? [])
      .sort(byText((item) => `${item.token}\u0000${item.id}`)),
    slugs: parts
      .flatMap((part) => part.slugs ?? [])
      .sort(byText((item) => `${item.table}\u0000${item.slug}`)),
    version: 1,
  };
}

export function renderPreflight(facts: PreflightFacts): string {
  return `${JSON.stringify(facts, null, 2)}\n`;
}

/** Runs one read-only SQL statement and returns its rows. */
export type D1Query = (sql: string) => Promise<Record<string, unknown>[]>;

export interface PreflightInput {
  readonly env: ApplyEnv;
  readonly facts: PreflightFacts;
  /** The raw KV value of `maintenance`, or null when it is not set. */
  readonly maintenance: string | null;
  /** `--reset --native-catalog`: native rows whose slug collides are deleted, not refused. */
  readonly nativeCatalog: boolean;
  readonly target: Target;
}

export interface PreflightRefusal {
  readonly code: string;
  /** Ids (D1 or legacy), never an address or a token. */
  readonly ids?: readonly string[];
  readonly message: string;
}

export interface ClaimLine {
  readonly email: string;
  readonly legacyId: string;
  /** The account's role in D1 (a claim never changes it). */
  readonly role: string;
  /** `claim`: this apply claims the account; `present`: it already holds this legacy id (an earlier apply, or a re-run). */
  readonly state: "claim" | "present";
}

export interface RoleDifference {
  readonly convexRole: string;
  readonly d1Role: string;
  readonly email: string;
  readonly legacyId: string;
}

export interface NativeCatalog {
  readonly categories: readonly string[];
  /** Native gestures in a deleted category: their `gesture_fts` rows are rebuilt. */
  readonly ftsGestures: readonly string[];
  readonly gestures: readonly string[];
}

export interface PreflightResult {
  readonly admins: {
    /** Admins in D1 now, with no ban in force. */
    readonly d1: number;
    /** Admins the import inserts (claimed accounts keep their own role). */
    readonly inserted: number;
  };
  readonly claims: readonly ClaimLine[];
  /** The highest applied migration number, or null when none is recorded. */
  readonly migration: number | null;
  readonly nativeCatalog: NativeCatalog;
  readonly refusals: readonly PreflightRefusal[];
  readonly roleDifferences: readonly RoleDifference[];
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    out.push(items.slice(start, start + size));
  }
  return out;
}

function jsonList(values: readonly string[]): string {
  return `(SELECT value FROM json_each(${sqlLiteral(JSON.stringify(values))}))`;
}

/** Runs `build(chunk)` for each chunk of `values` and concatenates the rows. */
async function lookup(
  query: D1Query,
  values: readonly string[],
  build: (list: string) => string
): Promise<Record<string, unknown>[]> {
  const distinct = [...new Set(values)].sort();
  const rows: Record<string, unknown>[] = [];
  for (const part of chunks(distinct, PREFLIGHT_CHUNK)) {
    // biome-ignore lint/performance/noAwaitInLoops: one wrangler call at a time.
    rows.push(...(await query(build(jsonList(part)))));
  }
  return rows;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

const MIGRATION_NUMBER = /^\d{4}_/;
const NO_SUCH_TABLE = /no such table/i;

async function lastMigration(query: D1Query): Promise<number | null> {
  let rows: Record<string, unknown>[];
  try {
    rows = await query('SELECT "name" FROM "d1_migrations"');
  } catch (error) {
    // A database no migration ever ran on has no table: "none". Anything
    // else (wrangler, the network) is not an answer, so it fails apply.
    if (NO_SUCH_TABLE.test(String(error))) {
      return null;
    }
    console.error("[migrate-convex] Failed to read d1_migrations:", error);
    throw error;
  }
  let last: number | null = null;
  for (const row of rows) {
    const name = text(row.name) ?? "";
    if (MIGRATION_NUMBER.test(name)) {
      const n = Number(name.slice(0, 4));
      last = last === null ? n : Math.max(last, n);
    }
  }
  return last;
}

/** On exactly as the site's gate reads it: a malformed value is off (task 10 review I-1). */
function maintenanceOn(raw: string | null): boolean {
  return parseMaintenanceSetting(raw)?.enabled === true;
}

/** An admin with no ban in force (the same rule as 0007's trigger and the reset). */
const ACTIVE_ADMIN = `"role" = 'admin' AND NOT (coalesce("banned", 0) = 1 AND ("ban_expires" IS NULL OR "ban_expires" > CAST(strftime('%s', 'now') AS INTEGER) * 1000))`;

interface ClaimCheck {
  claims: ClaimLine[];
  inserted: number;
  refusals: PreflightRefusal[];
  roleDifferences: RoleDifference[];
}

interface Account {
  readonly legacyId: string | null;
  readonly role: string;
}

/** The D1 accounts holding the emitted addresses, and the emitted legacy ids D1 already has. */
async function claimLookups(
  query: D1Query,
  facts: PreflightFacts
): Promise<{ byEmail: Map<string, Account>; knownLegacy: Set<string> }> {
  const byEmail = new Map<string, Account>();
  for (const row of await lookup(
    query,
    facts.claims.map((claim) => claim.email),
    (list) =>
      `SELECT "email", "legacy_id", "role" FROM "user" WHERE "email" IN ${list}`
  )) {
    const email = text(row.email);
    if (email !== null) {
      byEmail.set(email, {
        legacyId: text(row.legacy_id),
        role: text(row.role) ?? "user",
      });
    }
  }
  const knownLegacy = new Set(
    (
      await lookup(
        query,
        facts.claims.map((claim) => claim.legacyId),
        (list) => `SELECT "legacy_id" FROM "user" WHERE "legacy_id" IN ${list}`
      )
    )
      .map((row) => text(row.legacy_id))
      .filter((value): value is string => value !== null)
  );
  return { byEmail, knownLegacy };
}

type Claim = PreflightFacts["claims"][number];

/** What happens to one claim against D1. */
function classifyClaim(
  claim: Claim,
  existing: Account | undefined,
  knownLegacy: ReadonlySet<string>
): "insert" | "insertAdmin" | "foreign" | "moved" | "claim" | "present" {
  if (!existing) {
    return claim.role === "admin" && !knownLegacy.has(claim.legacyId)
      ? "insertAdmin"
      : "insert";
  }
  if (existing.legacyId !== null) {
    return existing.legacyId === claim.legacyId ? "present" : "foreign";
  }
  // The claim would set a legacy id another row holds: UNIQUE fails
  // mid-file (task 10 review M-2).
  return knownLegacy.has(claim.legacyId) ? "moved" : "claim";
}

async function checkClaims(
  query: D1Query,
  facts: PreflightFacts
): Promise<ClaimCheck> {
  const { byEmail, knownLegacy } = await claimLookups(query, facts);
  const result: ClaimCheck = {
    claims: [],
    inserted: 0,
    refusals: [],
    roleDifferences: [],
  };
  const foreign: string[] = [];
  const moved: string[] = [];
  for (const claim of facts.claims) {
    const existing = byEmail.get(claim.email);
    const kind = classifyClaim(claim, existing, knownLegacy);
    if (kind === "insertAdmin") {
      result.inserted += 1;
    } else if (kind === "foreign") {
      foreign.push(claim.legacyId);
    } else if (kind === "moved") {
      moved.push(claim.legacyId);
    } else if (existing && (kind === "claim" || kind === "present")) {
      result.claims.push({
        email: claim.email,
        legacyId: claim.legacyId,
        role: existing.role,
        state: kind,
      });
      if (existing.role !== claim.role) {
        result.roleDifferences.push({
          convexRole: claim.role,
          d1Role: existing.role,
          email: claim.email,
          legacyId: claim.legacyId,
        });
      }
    }
  }
  if (foreign.length > 0) {
    result.refusals.push({
      code: "addressClaimedByOtherLegacyId",
      ids: foreign,
      message: `${foreign.length} emitted address(es) belong to D1 accounts that another legacy id already claimed (a rehearsal of another export?); their rows would attach to nobody. Reset that import first.`,
    });
  }
  if (moved.length > 0) {
    result.refusals.push({
      code: "legacyIdOnOtherAddress",
      ids: moved,
      message: `${moved.length} legacy id(s) are already on an account with another address, while the plan's address belongs to an unclaimed account (a plan made with a newer WorkOS file?). Reset the earlier import first.`,
    });
  }
  return result;
}

interface SlugCheck {
  native: NativeCatalog;
  refusals: PreflightRefusal[];
}

async function checkSlugs(
  query: D1Query,
  facts: PreflightFacts,
  nativeCatalog: boolean
): Promise<SlugCheck> {
  const refusals: PreflightRefusal[] = [];
  const native: { categories: string[]; gestures: string[] } = {
    categories: [],
    gestures: [],
  };
  for (const table of ["category", "gesture"] as const) {
    const planned = new Map(
      facts.slugs
        .filter((entry) => entry.table === table)
        .map((entry) => [entry.slug, entry.legacyId])
    );
    // biome-ignore lint/performance/noAwaitInLoops: two tables, one after the other.
    const rows = await lookup(
      query,
      [...planned.keys()],
      (list) =>
        `SELECT "id", "slug", "legacy_id" FROM "${table}" WHERE "slug" IN ${list}`
    );
    const foreign: string[] = [];
    const nativeIds: string[] = [];
    for (const row of rows) {
      const legacyId = text(row.legacy_id);
      const slug = text(row.slug) ?? "";
      if (legacyId !== null && legacyId === planned.get(slug)) {
        continue;
      }
      const id = text(row.id) ?? "";
      if (legacyId === null) {
        nativeIds.push(id);
      } else {
        foreign.push(id);
      }
    }
    if (nativeIds.length > 0 && !nativeCatalog) {
      refusals.push({
        code: "slugTakenByNativeRow",
        ids: nativeIds.sort(),
        message: `${nativeIds.length} emitted ${table} slug(s) are taken by rows the new system made (on dev or staging, --reset --native-catalog deletes them).`,
      });
    }
    if (foreign.length > 0) {
      refusals.push({
        code: "slugTakenByOtherImport",
        ids: foreign.sort(),
        message: `${foreign.length} emitted ${table} slug(s) are taken by imported rows of another legacy id (an import of another export?).`,
      });
    }
    native[table === "category" ? "categories" : "gestures"] = nativeCatalog
      ? nativeIds.sort()
      : [];
  }
  const ftsGestures =
    native.categories.length === 0
      ? []
      : (
          await lookup(
            query,
            native.categories,
            (list) =>
              `SELECT DISTINCT "gesture_id" FROM "gesture_category" WHERE "category_id" IN ${list}`
          )
        )
          .map((row) => text(row.gesture_id))
          .filter((id): id is string => id !== null)
          .sort();
  return {
    native: { ...native, ftsGestures },
    refusals,
  };
}

/** Rows of `table` that hold an emitted `column` value under another id. */
async function foreignHolders(
  query: D1Query,
  table: "list_share" | "payment",
  column: "mollie_id" | "token",
  planned: readonly { id: string; value: string }[]
): Promise<string[]> {
  const byValue = new Map(planned.map((entry) => [entry.value, entry.id]));
  const rows = await lookup(
    query,
    [...byValue.keys()],
    (list) =>
      `SELECT "id", "${column}" AS "value" FROM "${table}" WHERE "${column}" IN ${list}`
  );
  return rows
    .filter((row) => byValue.get(text(row.value) ?? "") !== text(row.id))
    .map((row) => text(row.id) ?? "")
    .sort();
}

/** The preflight (see the module comment). Only reads. */
export async function runPreflight(
  query: D1Query,
  input: PreflightInput
): Promise<PreflightResult> {
  const refusals: PreflightRefusal[] = [];
  const migration = await lastMigration(query);
  if (migration === null || migration < REQUIRED_MIGRATION) {
    refusals.push({
      code: "migrationsBehind",
      message: `D1 is at migration ${migration ?? "none"}; apply needs ${String(REQUIRED_MIGRATION).padStart(4, "0")} or later (run the deploy's migrations first).`,
    });
  }
  if (input.env !== "dev" && !maintenanceOn(input.maintenance)) {
    refusals.push({
      code: "maintenanceOff",
      message: `Maintenance is not on for ${input.env}: turn it on first (bun run maintenance --env ${input.env} on).`,
    });
  }
  if (input.env === "staging") {
    const real = input.facts.claims.filter(
      (claim) => !claim.email.endsWith("@staging.invalid")
    );
    if (real.length > 0) {
      refusals.push({
        code: "unsanitisedOnStaging",
        ids: real.map((claim) => claim.legacyId),
        message: `${real.length} address(es) are not pseudonymised: staging never receives real addresses (B2).`,
      });
    }
  }
  const slugs = await checkSlugs(query, input.facts, input.nativeCatalog);
  refusals.push(...slugs.refusals);
  const tokens = await foreignHolders(
    query,
    "list_share",
    "token",
    input.facts.shareTokens.map((entry) => ({
      id: entry.id,
      value: entry.token,
    }))
  );
  if (tokens.length > 0) {
    refusals.push({
      code: "shareTokenTaken",
      ids: tokens,
      message: `${tokens.length} emitted share token(s) already belong to other shares.`,
    });
  }
  const mollie = await foreignHolders(
    query,
    "payment",
    "mollie_id",
    input.facts.mollieIds.map((entry) => ({
      id: entry.id,
      value: entry.mollieId,
    }))
  );
  if (mollie.length > 0) {
    refusals.push({
      code: "mollieIdTaken",
      ids: mollie,
      message: `${mollie.length} emitted Mollie id(s) already belong to other payments.`,
    });
  }
  const claims = await checkClaims(query, input.facts);
  refusals.push(...claims.refusals);
  const [adminRow] = await query(
    `SELECT count(*) AS "n" FROM "user" WHERE ${ACTIVE_ADMIN}`
  );
  const admins = {
    d1: Number(adminRow?.n ?? 0),
    inserted: claims.inserted,
  };
  if (admins.d1 + admins.inserted === 0) {
    refusals.push({
      code: "noAdmin",
      message:
        "The import would leave no admin: D1 has none, and the plan inserts none (claimed accounts keep their own role).",
    });
  }
  return {
    admins,
    claims: claims.claims,
    migration,
    nativeCatalog: slugs.native,
    refusals,
    roleDifferences: claims.roleDifferences,
  };
}

// --- Verification ------------------------------------------------------------

/**
 * Each verified table: the report count it must equal, and how D1 counts
 * the imported rows. `sponsorship_token` is left out: a staging plan drops
 * the tokens and keeps the counts equal to production's, so no report
 * count says how many were written.
 */
export const VERIFY_COUNTS: readonly {
  readonly count: string;
  readonly domain:
    | "users"
    | "catalog"
    | "learning"
    | "account"
    | "sponsorships";
  readonly name: string;
  readonly sql: string;
}[] = [
  {
    count: "migrated",
    domain: "users",
    name: "user",
    sql: `SELECT count(*) AS "n" FROM "user" WHERE "legacy_id" IS NOT NULL`,
  },
  {
    count: "categories",
    domain: "catalog",
    name: "category",
    sql: `SELECT count(*) AS "n" FROM "category" WHERE "legacy_id" IS NOT NULL`,
  },
  {
    count: "gestures",
    domain: "catalog",
    name: "gesture",
    sql: `SELECT count(*) AS "n" FROM "gesture" WHERE "legacy_id" IS NOT NULL`,
  },
  {
    count: "gestureKeywords",
    domain: "catalog",
    name: "gesture_keyword",
    sql: `SELECT count(*) AS "n" FROM "gesture_keyword" AS "k" JOIN "gesture" AS "g" ON "g"."id" = "k"."gesture_id" WHERE "g"."legacy_id" IS NOT NULL`,
  },
  {
    count: "gestureCategoryLinks",
    domain: "catalog",
    name: "gesture_category",
    sql: `SELECT count(*) AS "n" FROM "gesture_category" AS "l" JOIN "gesture" AS "g" ON "g"."id" = "l"."gesture_id" JOIN "category" AS "c" ON "c"."id" = "l"."category_id" WHERE "g"."legacy_id" IS NOT NULL AND "c"."legacy_id" IS NOT NULL`,
  },
  {
    count: "gestures",
    domain: "catalog",
    name: "gesture_fts",
    sql: `SELECT count(*) AS "n" FROM "gesture_fts" WHERE "gesture_id" IN (SELECT "id" FROM "gesture" WHERE "legacy_id" IS NOT NULL)`,
  },
  {
    count: "favorites",
    domain: "learning",
    name: "favorite",
    sql: `SELECT count(*) AS "n" FROM "favorite" AS "f" JOIN "user" AS "u" ON "u"."id" = "f"."user_id" JOIN "gesture" AS "g" ON "g"."id" = "f"."gesture_id" WHERE "u"."legacy_id" IS NOT NULL AND "g"."legacy_id" IS NOT NULL`,
  },
  {
    count: "lists",
    domain: "learning",
    name: "list",
    sql: `SELECT count(*) AS "n" FROM "list" AS "l" JOIN "user" AS "u" ON "u"."id" = "l"."owner_id" WHERE "u"."legacy_id" IS NOT NULL`,
  },
  {
    count: "listItems",
    domain: "learning",
    name: "list_item",
    sql: `SELECT count(*) AS "n" FROM "list_item" AS "i" JOIN "list" AS "l" ON "l"."id" = "i"."list_id" JOIN "user" AS "u" ON "u"."id" = "l"."owner_id" JOIN "gesture" AS "g" ON "g"."id" = "i"."gesture_id" WHERE "u"."legacy_id" IS NOT NULL AND "g"."legacy_id" IS NOT NULL`,
  },
  {
    count: "listShares",
    domain: "learning",
    name: "list_share",
    sql: `SELECT count(*) AS "n" FROM "list_share" AS "s" JOIN "list" AS "l" ON "l"."id" = "s"."list_id" JOIN "user" AS "u" ON "u"."id" = "l"."owner_id" WHERE "u"."legacy_id" IS NOT NULL`,
  },
  {
    count: "consentEvents",
    domain: "account",
    name: "consent_event",
    sql: `SELECT count(*) AS "n" FROM "consent_event" WHERE "source" = 'import'`,
  },
  {
    count: "auditLogs",
    domain: "account",
    name: "audit_log",
    sql: `SELECT count(*) AS "n" FROM "audit_log" WHERE "action" = 'legacy'`,
  },
  {
    count: "sponsorships",
    domain: "sponsorships",
    name: "sponsorship",
    sql: `SELECT count(*) AS "n" FROM "sponsorship" WHERE "legacy_id" IS NOT NULL`,
  },
  {
    count: "sponsors",
    domain: "sponsorships",
    name: "sponsor",
    sql: `SELECT count(*) AS "n" FROM "sponsor" WHERE "id" IN (SELECT "sponsor_id" FROM "sponsorship" WHERE "legacy_id" IS NOT NULL)`,
  },
  {
    count: "invoiceRequests",
    domain: "sponsorships",
    name: "invoice_request",
    sql: `SELECT count(*) AS "n" FROM "invoice_request" WHERE "sponsor_id" IN (SELECT "sponsor_id" FROM "sponsorship" WHERE "legacy_id" IS NOT NULL)`,
  },
  {
    count: "payments",
    domain: "sponsorships",
    name: "payment",
    sql: `SELECT count(*) AS "n" FROM "payment" WHERE "id" IN (SELECT "i"."payment_id" FROM "payment_item" AS "i" JOIN "sponsorship" AS "s" ON "s"."id" = "i"."sponsorship_id" WHERE "s"."legacy_id" IS NOT NULL)`,
  },
  {
    count: "paymentItems",
    domain: "sponsorships",
    name: "payment_item",
    sql: `SELECT count(*) AS "n" FROM "payment_item" AS "i" JOIN "sponsorship" AS "s" ON "s"."id" = "i"."sponsorship_id" WHERE "s"."legacy_id" IS NOT NULL`,
  },
  {
    count: "events",
    domain: "sponsorships",
    name: "sponsorship_event",
    sql: `SELECT count(*) AS "n" FROM "sponsorship_event" AS "e" JOIN "sponsorship" AS "s" ON "s"."id" = "e"."sponsorship_id" WHERE "s"."legacy_id" IS NOT NULL`,
  },
];

export interface VerifiedCount {
  readonly actual: number;
  readonly expected: number;
  readonly name: string;
  /**
   * `ok`: equal. `more`: D1 holds more (rows the site added since, or a
   * claimed account's own rows), a note. `missing`: fewer, a failure.
   */
  readonly status: "ok" | "more" | "missing";
}

/** The report's counts against D1's (after the files ran). */
export async function verifyCounts(
  query: D1Query,
  report: Pick<Report, "sections">
): Promise<VerifiedCount[]> {
  const out: VerifiedCount[] = [];
  for (const entry of VERIFY_COUNTS) {
    const expected =
      report.sections.find((part) => part.domain === entry.domain)?.counts[
        entry.count
      ] ?? 0;
    // biome-ignore lint/performance/noAwaitInLoops: one wrangler call at a time.
    const [row] = await query(entry.sql);
    const actual = Number(row?.n ?? 0);
    let status: VerifiedCount["status"] = "ok";
    if (actual > expected) {
      status = "more";
    } else if (actual < expected) {
      status = "missing";
    }
    out.push({ actual, expected, name: entry.name, status });
  }
  return out;
}
