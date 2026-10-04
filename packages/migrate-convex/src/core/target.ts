/**
 * The plan's target and the staging pseudonymiser (phase 8 global
 * constraints, B2).
 *
 * A plan is made for one target. A `staging` plan is always
 * pseudonymised, with every count kept identical:
 * - every `user.email`, `sponsor.email` and `invoice_request.email` becomes
 *   `<legacyUuid>@staging.invalid`;
 * - names become placeholders ("Gebruiker <n>", "Sponsor <n>"; the
 *   sponsorship's `display_name` "Sponsor <n>");
 * - VAT numbers become `""`;
 * - `video_asset_id` and `gesture.mux_asset_id` become NULL;
 * - `sponsorship_token` rows are dropped (the rows are not counted away:
 *   the report still counts the tokens the export had).
 *
 * A `production` plan keeps the data as it is. The transforms (phase 8
 * tasks 7 and 8) route every such field through `pseudonymiser(target)`,
 * so no transform decides this on its own.
 */

export const TARGETS = ["staging", "production"] as const;
export type Target = (typeof TARGETS)[number];

export function isTarget(value: string): value is Target {
  return (TARGETS as readonly string[]).includes(value);
}

/** The reserved domain of every staging address (RFC 2606). */
export const STAGING_EMAIL_DOMAIN = "staging.invalid";

/** The pseudonymised address of the row whose id is `id` (its `legacyUuid`). */
export function pseudoEmail(id: string): string {
  if (id.length === 0) {
    throw new Error("[migrate-convex] pseudoEmail needs the row's id");
  }
  return `${id}@${STAGING_EMAIL_DOMAIN}`;
}

export type PseudoNameKind = "user" | "sponsor";

const NAME_PREFIX: Record<PseudoNameKind, string> = {
  sponsor: "Sponsor",
  user: "Gebruiker",
};

/** "Gebruiker <n>" or "Sponsor <n>", for the `n`-th row (from 1) in plan order. */
export function pseudoName(kind: PseudoNameKind, n: number): string {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new Error(`[migrate-convex] pseudoName needs n >= 1, got ${n}`);
  }
  return `${NAME_PREFIX[kind]} ${n}`;
}

/**
 * The per-target treatment of every personal or secret field. On
 * `production` each method returns the value it is given; on `staging`
 * each returns the placeholder above.
 */
export interface Pseudonymiser {
  /** A Mux asset id (`video_asset_id`, `gesture.mux_asset_id`): NULL on staging. */
  assetId: (real: string | null | undefined) => string | null;
  /** A company name (`sponsor.company`): NULL on staging. */
  company: (real: string | null | undefined) => string | null;
  /** An address; `id` is the row's `legacyUuid`. */
  email: (id: string, real: string) => string;
  /** A person's or sponsor's name; `n` numbers the rows of that kind from 1. */
  name: (kind: PseudoNameKind, n: number, real: string) => string;
  /** Whether `pseudonymised` is on (the staging target). */
  readonly pseudonymised: boolean;
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
  name: (_kind, _n, real) => real,
  pseudonymised: false,
  target: "production",
  tokens: (rows) => rows,
  vat: (real) => real,
};

const STAGING: Pseudonymiser = {
  assetId: () => null,
  company: () => null,
  email: (id) => pseudoEmail(id),
  name: (kind, n) => pseudoName(kind, n),
  pseudonymised: true,
  target: "staging",
  tokens: () => [],
  vat: () => "",
};

/** The pseudonymiser of `target` (a staging plan always pseudonymises). */
export function pseudonymiser(target: Target): Pseudonymiser {
  return target === "staging" ? STAGING : PRODUCTION;
}
