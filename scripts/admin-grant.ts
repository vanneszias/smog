import { join } from "node:path";

/**
 * `bun run admin:grant --env <dev|staging|production> [--dry-run] <email>`:
 * gives an existing account the `admin` role (spec §6). It runs
 * `wrangler d1 execute DB` from `apps/site` (`--local` in dev, `--remote`
 * otherwise); `--dry-run` prints the command instead. The account signs
 * in again (or its session refreshes) to pick up the role.
 */

const ENVS = ["dev", "staging", "production"] as const;
export type GrantEnv = (typeof ENVS)[number];

/** Deliberately strict: one `local@domain.tld`, no spaces or control chars. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isGrantEnv(value: string | undefined): value is GrantEnv {
  return ENVS.includes(value as GrantEnv);
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** The UPDATE for `email` (lower-cased, as Better Auth stores it). */
export function buildGrantSql(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL.test(normalized)) {
    throw new Error(
      `[adminGrant] Not an email address: ${JSON.stringify(email)}`
    );
  }
  return `UPDATE user SET role = 'admin', updated_at = CAST(unixepoch('subsec') * 1000 AS INTEGER) WHERE email = ${quote(normalized)} RETURNING id, email, role;`;
}

/** The wrangler argv (no shell, so the SQL is one argument). */
export function buildGrantCommand(env: GrantEnv, email: string): string[] {
  return [
    "wrangler",
    "d1",
    "execute",
    "DB",
    "--env",
    env,
    env === "dev" ? "--local" : "--remote",
    "--command",
    buildGrantSql(email),
  ];
}

export interface GrantArgs {
  dryRun: boolean;
  email: string;
  env: GrantEnv;
}

export function parseGrantArgs(argv: readonly string[]): GrantArgs {
  let env: string | undefined;
  let dryRun = false;
  let expectEnv = false;
  const emails: string[] = [];
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
      emails.push(arg);
    }
  }
  if (!isGrantEnv(env)) {
    throw new Error(
      `[adminGrant] Pass --env ${ENVS.join("|")} (got ${JSON.stringify(env)})`
    );
  }
  const [email, ...rest] = emails;
  if (email === undefined) {
    throw new Error("[adminGrant] Pass the account's email");
  }
  if (rest.length > 0) {
    throw new Error("[adminGrant] Pass one email at a time");
  }
  return { dryRun, email, env };
}

function run(args: GrantArgs): void {
  const command = buildGrantCommand(args.env, args.email);
  if (args.dryRun) {
    const shown = command.map((arg) => JSON.stringify(arg)).join(" ");
    console.log(`(cd apps/site && bunx ${shown})`);
    return;
  }
  const proc = Bun.spawnSync(["bunx", ...command], {
    cwd: join(import.meta.dir, "..", "apps", "site"),
    stdio: ["inherit", "inherit", "inherit"],
  });
  if (proc.exitCode !== 0) {
    throw new Error(`[adminGrant] wrangler exited with ${proc.exitCode}`);
  }
  console.log(
    "[adminGrant] Done. An empty result means no account has that email."
  );
}

if (import.meta.main) {
  let args: GrantArgs;
  try {
    args = parseGrantArgs(process.argv.slice(2));
    buildGrantSql(args.email);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(
      "Usage: bun run admin:grant --env <dev|staging|production> [--dry-run] <email>"
    );
    process.exit(1);
  }
  try {
    run(args);
  } catch (error) {
    console.error("[adminGrant] Failed to grant the admin role:", error);
    process.exit(1);
  }
}
