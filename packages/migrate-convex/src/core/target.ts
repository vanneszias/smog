/**
 * The plan's target and the staging pseudonymiser (phase 8 global
 * constraints, B2; task 5 review I1).
 *
 * A plan is made for one target. A `staging` plan is always
 * pseudonymised, with every row count kept identical:
 * - every `user.email`, `sponsor.email` and `invoice_request.email` becomes
 *   `<legacyUuid>@staging.invalid` (`email`);
 * - people's and sponsors' names become placeholders (`name`): the user's
 *   name "Gebruiker <n>"; `sponsor.name`, `invoice_request.name` and the
 *   sponsorship's `display_name` "Sponsor <n>";
 * - `sponsor.company` becomes NULL (`company`);
 * - VAT numbers become `""` (`vat`);
 * - `video_asset_id` and `gesture.mux_asset_id` become NULL (`assetId`);
 * - `sponsorship_token` rows are dropped (`tokens`; the report still
 *   counts the export's tokens), while list share tokens are **replaced**
 *   by a deterministic token of the same shape (`shareToken`), so every
 *   share row stays and the share links can be rehearsed;
 * - list names become "Lijst <n>" and descriptions NULL (`listName`,
 *   `listDescription`);
 * - free text kept in legacy data (the `legacy` sponsorship event's
 *   `sponsorName`, original `overlayText` and `rejectionReason`) becomes
 *   `STAGING_TEXT` (`freeText`), and an admin log's `metadata` loses the
 *   values of `STAGING_TEXT_KEYS` (`legacyMetadata`: `reject_sponsorship`'s
 *   `reason`, …).
 *
 * Kept on staging on purpose (not personal, or needed to rehearse): ids,
 * dates, amounts, statuses, Mollie payment ids (a test-mode key cannot
 * fetch them anyway) and playback ids (a sponsored video shows the
 * sponsor's text and logo; it is the public video, not stored data).
 *
 * A `production` plan keeps the data as it is. The transforms (tasks 7
 * and 8) route every such field through `pseudonymiser(target)`, so no
 * transform decides this on its own.
 */

export const TARGETS = ["staging", "production"] as const;
export type Target = (typeof TARGETS)[number];

export function isTarget(value: string): value is Target {
  return (TARGETS as readonly string[]).includes(value);
}

/** The reserved domain of every staging address (RFC 2606). */
export const STAGING_EMAIL_DOMAIN = "staging.invalid";

/** What replaces free text from the data on staging. */
export const STAGING_TEXT = "[staging]";

/**
 * The keys whose values `legacyMetadata` replaces on staging, at any
 * depth: free text an admin or a sponsor wrote, and contact fields.
 */
export const STAGING_TEXT_KEYS: ReadonlySet<string> = new Set([
  "contactCompany",
  "contactFullName",
  "description",
  "email",
  "invoiceEmail",
  "invoiceName",
  "invoiceVatNumber",
  "overlayText",
  "reason",
  "rejectionReason",
  "sponsorEmail",
  "sponsorName",
]);

/** The pseudonymised address of the row whose id is `id` (its `legacyUuid`). */
export function pseudoEmail(id: string): string {
  if (id.length === 0) {
    throw new Error("[migrate-convex] pseudoEmail needs the row's id");
  }
  return `${id}@${STAGING_EMAIL_DOMAIN}`;
}

export type PseudoNameKind = "user" | "sponsor" | "list";

const NAME_PREFIX: Record<PseudoNameKind, string> = {
  list: "Lijst",
  sponsor: "Sponsor",
  user: "Gebruiker",
};

/** "Gebruiker <n>", "Sponsor <n>" or "Lijst <n>", for the `n`-th row (from 1) in plan order. */
export function pseudoName(kind: PseudoNameKind, n: number): string {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new Error(`[migrate-convex] pseudoName needs n >= 1, got ${n}`);
  }
  return `${NAME_PREFIX[kind]} ${n}`;
}

const encoder = new TextEncoder();
const BASE64_PADDING = /[=]+$/;

/**
 * A staging share token for `key` (the share's legacy key, for example
 * `JSON.stringify([listId, "view"])`): the SHA-256 of
 * `smog-convex:staging-share:<key>` as unpadded base64url, the shape of
 * `newToken()` (43 characters). Deterministic, so a re-plan gives the
 * same links, and unrelated to the real token.
 */
export async function pseudoShareToken(key: string): Promise<string> {
  if (key.length === 0) {
    throw new Error("[migrate-convex] pseudoShareToken needs a key");
  }
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(`smog-convex:staging-share:${key}`)
    )
  );
  let binary = "";
  for (const byte of digest) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(BASE64_PADDING, "");
}

function scrubMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubMetadata);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        STAGING_TEXT_KEYS.has(key) && inner !== null && inner !== undefined
          ? STAGING_TEXT
          : scrubMetadata(inner),
      ])
    );
  }
  return value;
}

/**
 * The per-target treatment of every personal or secret field (see the
 * module comment). On `production` each method returns the value it is
 * given; on `staging` each returns the placeholder.
 */
export interface Pseudonymiser {
  /** A Mux asset id (`video_asset_id`, `gesture.mux_asset_id`): NULL on staging. */
  assetId: (real: string | null | undefined) => string | null;
  /** A company name (`sponsor.company`): NULL on staging. */
  company: (real: string | null | undefined) => string | null;
  /** An address; `id` is the row's `legacyUuid`. */
  email: (id: string, real: string) => string;
  /** Free text kept in legacy data: `STAGING_TEXT` on staging; absent stays absent. */
  freeText: <T extends string | null | undefined>(real: T) => T | string;
  /** An admin log's `metadata`: `STAGING_TEXT_KEYS` values replaced, at any depth. */
  legacyMetadata: (metadata: unknown) => unknown;
  /** A list's description: NULL on staging. */
  listDescription: (real: string | null | undefined) => string | null;
  /** A list's name; `n` numbers the lists from 1: "Lijst <n>" on staging. */
  listName: (n: number, real: string) => string;
  /**
   * A person's or sponsor's name; `n` numbers the rows of that kind from
   * 1. `user.name`; `sponsor.name`, `invoice_request.name` and the
   * sponsorship's `display_name` (all "Sponsor <n>").
   */
  name: (
    kind: Exclude<PseudoNameKind, "list">,
    n: number,
    real: string
  ) => string;
  /** Whether `pseudonymised` is on (the staging target). */
  readonly pseudonymised: boolean;
  /** A list share token; `key` is the share's legacy key (`pseudoShareToken`). */
  shareToken: (key: string, real: string) => Promise<string>;
  readonly target: Target;
  /** Token rows (`sponsorship_token`): dropped on staging. */
  tokens: <T>(rows: readonly T[]) => readonly T[];
  /** A VAT number: `""` on staging. */
  vat: (real: string) => string;
}

const PRODUCTION: Pseudonymiser = {
  assetId: (real) => real ?? null,
  company: (real) => real ?? null,
  email: (_id, real) => real,
  freeText: (real) => real,
  legacyMetadata: (metadata) => metadata,
  listDescription: (real) => real ?? null,
  listName: (_n, real) => real,
  name: (_kind, _n, real) => real,
  pseudonymised: false,
  shareToken: (_key, real) => Promise.resolve(real),
  target: "production",
  tokens: (rows) => rows,
  vat: (real) => real,
};

const STAGING: Pseudonymiser = {
  assetId: () => null,
  company: () => null,
  email: (id) => pseudoEmail(id),
  freeText: (real) =>
    real === null || real === undefined ? real : STAGING_TEXT,
  legacyMetadata: scrubMetadata,
  listDescription: () => null,
  listName: (n) => pseudoName("list", n),
  name: (kind, n) => pseudoName(kind, n),
  pseudonymised: true,
  shareToken: (key) => pseudoShareToken(key),
  target: "staging",
  tokens: () => [],
  vat: () => "",
};

/** The pseudonymiser of `target` (a staging plan always pseudonymises). */
export function pseudonymiser(target: Target): Pseudonymiser {
  return target === "staging" ? STAGING : PRODUCTION;
}
