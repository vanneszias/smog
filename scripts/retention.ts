import { join } from "node:path";

/**
 * `bun run retention --env <dev|staging|production> --dry-run`
 *
 * Counts what the daily retention purge (`15 3 * * *`, `runRetentionPurge`,
 * phase 6 ruling 9 as amended by task 5 fix round 1) would delete now, in
 * that env's D1, with one read-only `SELECT` through `wrangler d1 execute`
 * (`--local` in dev, `--remote` otherwise). It changes nothing and only
 * runs as a dry run: the purge itself runs on the cron. It also prints the
 * range of the expired sessions' `expires_at`, which must be epoch
 * **milliseconds** (about 1.7e12), the unit every cutoff uses. The R2
 * orphan objects cannot be counted from D1; the logo line counts the
 * sponsorships whose `logo_key` would be released.
 *
 * The windows mirror `@smog/db` `retention.ts` and
 * `@smog/sponsorships` `orphan-logos.ts` (scripts may not import them);
 * change them together.
 */

const ENVS = ["dev", "staging", "production"] as const;
export type RetentionEnv = (typeof ENVS)[number];

const DAY_MS = 86_400_000;
/** `AUDIT_RETENTION_MS`. */
const AUDIT_MS = 3 * 365 * DAY_MS;
/** `SPONSORSHIP_TOKEN_GRACE_MS`. */
const TOKEN_GRACE_MS = 29 * DAY_MS;
/** `TERMINAL_LOGO_GRACE_MS`. */
const LOGO_GRACE_MS = 30 * DAY_MS;

const NOW = "CAST(unixepoch('subsec') * 1000 AS INTEGER)";

/** Whether sponsorship `s` may lose its logo (orphan-logos.ts `releasable`). */
function releasable(alias: string): string {
  return `(${alias}.updated_at < ${NOW} - ${LOGO_GRACE_MS} AND (${alias}.status = 'expired' OR (${alias}.status IN ('rejected', 'cancelled') AND NOT EXISTS (SELECT 1 FROM payment_item pi INNER JOIN payment p ON p.id = pi.payment_id WHERE pi.sponsorship_id = ${alias}.id AND pi.includes_logo = 1 AND NOT (p.status IN ('canceled', 'expired', 'failed') AND p.paid_at IS NULL)))))`;
}

/** The one read-only statement: a count per purge, and the session range. */
export function buildCountSql(): string {
  return [
    "SELECT",
    `(SELECT count(*) FROM audit_log WHERE created_at < ${NOW} - ${AUDIT_MS}) AS audit_log,`,
    `(SELECT count(*) FROM session WHERE expires_at < ${NOW}) AS session,`,
    `(SELECT count(*) FROM verification WHERE expires_at < ${NOW}) AS verification,`,
    `(SELECT count(*) FROM sponsorship_token WHERE expires_at < ${NOW} - ${TOKEN_GRACE_MS} OR used_at < ${NOW} - ${TOKEN_GRACE_MS}) AS sponsorship_token,`,
    `(SELECT count(*) FROM sponsorship s WHERE s.logo_key IS NOT NULL AND ${releasable("s")} AND NOT EXISTS (SELECT 1 FROM sponsorship o WHERE o.logo_key = s.logo_key AND NOT ${releasable("o")})) AS logos_released,`,
    `(SELECT min(expires_at) FROM session WHERE expires_at < ${NOW}) AS expired_session_min,`,
    `(SELECT max(expires_at) FROM session WHERE expires_at < ${NOW}) AS expired_session_max,`,
    `${NOW} AS now_ms;`,
  ].join(" ");
}

/** The wrangler argv (no shell, so the SQL is one argument). */
export function buildCountCommand(env: RetentionEnv): string[] {
  return [
    "wrangler",
    "d1",
    "execute",
    "DB",
    "--env",
    env,
    env === "dev" ? "--local" : "--remote",
    "--json",
    "--command",
    buildCountSql(),
  ];
}

export interface RetentionArgs {
  env: RetentionEnv;
}

export function parseRetentionArgs(argv: readonly string[]): RetentionArgs {
  let env: string | undefined;
  let dryRun = false;
  let expectEnv = false;
  for (const arg of argv) {
    if (expectEnv) {
      env = arg;
      expectEnv = false;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--env") {
      expectEnv = true;
    } else if (arg.startsWith("--env=")) {
      env = arg.slice("--env=".length);
    } else {
      throw new Error(`[retention] Unknown argument ${JSON.stringify(arg)}`);
    }
  }
  if (!dryRun) {
    throw new Error(
      "[retention] Only --dry-run is supported: the purge itself runs on the daily cron"
    );
  }
  if (!ENVS.includes(env as RetentionEnv)) {
    throw new Error(
      `[retention] Pass --env ${ENVS.join("|")} (got ${JSON.stringify(env)})`
    );
  }
  return { env: env as RetentionEnv };
}

/** Runs a command and answers its exit code and stdout. */
export type Runner = (
  argv: readonly string[],
  cwd: string
) => { exitCode: number; stdout: string };

const SITE_DIR = join(import.meta.dir, "..", "apps", "site");

/** `wrangler d1 execute --json` prints `[{ results: [row] , … }]`. */
function firstRow(stdout: string): Record<string, unknown> {
  const parsed = JSON.parse(stdout) as { results?: unknown[] }[];
  const row = parsed[0]?.results?.[0];
  if (!row || typeof row !== "object") {
    throw new Error("[retention] wrangler printed no result row");
  }
  return row as Record<string, unknown>;
}

/** The report lines of a dry run. */
export function reportLines(
  env: RetentionEnv,
  row: Record<string, unknown>
): string[] {
  const lines = [
    `[retention] Dry run on ${env} (nothing is deleted):`,
    `  audit_log older than 3 × 365 days: ${row.audit_log}`,
    `  expired sessions: ${row.session}`,
    `  expired verifications: ${row.verification}`,
    `  sponsorship tokens used or expired more than 29 days ago: ${row.sponsorship_token}`,
    `  sponsorships whose logo would be released: ${row.logos_released}`,
    "  R2 orphan logos: not countable from D1 (the cron logs logosDeleted)",
  ];
  const max = Number(row.expired_session_max);
  if (row.expired_session_max !== null && max < 1e12) {
    lines.push(
      `[retention] WARNING: expired session expires_at max is ${max}, not epoch milliseconds; do not let the purge run`
    );
  } else if (row.expired_session_max !== null) {
    lines.push(
      `  expired sessions' expires_at range: ${row.expired_session_min} … ${max} (epoch ms; now ${row.now_ms})`
    );
  }
  return lines;
}

export function runRetentionDryRun(
  args: RetentionArgs,
  runner: Runner
): string[] {
  const { exitCode, stdout } = runner(
    ["bunx", ...buildCountCommand(args.env)],
    SITE_DIR
  );
  if (exitCode !== 0) {
    throw new Error(`[retention] wrangler exited with ${exitCode}`);
  }
  return reportLines(args.env, firstRow(stdout));
}

const bunRunner: Runner = (argv, cwd) => {
  const proc = Bun.spawnSync([...argv], {
    cwd,
    stderr: "inherit",
    stdout: "pipe",
  });
  return { exitCode: proc.exitCode, stdout: proc.stdout.toString() };
};

if (import.meta.main) {
  try {
    const args = parseRetentionArgs(process.argv.slice(2));
    for (const line of runRetentionDryRun(args, bunRunner)) {
      console.log(line);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(
      "Usage: bun run retention --env <dev|staging|production> --dry-run"
    );
    process.exit(1);
  }
}
