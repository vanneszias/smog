import { join } from "node:path";
import { buildGrantSql } from "@smog/config/admin-grant";

/**
 * `bun run admin:grant --env <dev|staging|production> [--create] [--dry-run] <email>`:
 * gives an account the `admin` role (spec §6). It runs
 * `wrangler d1 execute DB` from `apps/site` (`--local` in dev, `--remote`
 * otherwise); `--dry-run` prints the command instead. It also lifts any
 * ban, so a banned account it recovers can sign in. The role applies on
 * the account's next request (it is read from D1 each time).
 *
 * `--create` (phase 8 ruling 18, the first production admin) first
 * inserts the account when no account has that email: verified, admin, no
 * password, `welcomed_at` set. It then signs in with an email code, also
 * during maintenance. With an existing account it is the plain grant. The
 * SQL is `@smog/config/admin-grant`'s; it never demotes anyone.
 */

const ENVS = ["dev", "staging", "production"] as const;
export type GrantEnv = (typeof ENVS)[number];

function isGrantEnv(value: string | undefined): value is GrantEnv {
  return ENVS.includes(value as GrantEnv);
}

/** Printed with the command: the grant is also an unban. */
const UNBAN_NOTE =
  "[adminGrant] This also lifts any ban on the account (banned, ban_reason and ban_expires are cleared).";

/** Printed with `--create`: what the new account is, and how it signs in. */
const CREATE_NOTE =
  '[adminGrant] --create: when no account has this email, it is created first (verified, admin, no password, name ""); it signs in with an email code. An existing account is only granted.';

/** The wrangler argv (no shell, so the SQL is one argument). */
export function buildGrantCommand(
  env: GrantEnv,
  email: string,
  { create = false, id }: { create?: boolean; id?: string } = {}
): string[] {
  return [
    "wrangler",
    "d1",
    "execute",
    "DB",
    "--env",
    env,
    env === "dev" ? "--local" : "--remote",
    "--command",
    buildGrantSql(email, { create, ...(id ? { id } : {}) }),
  ];
}

export interface GrantArgs {
  create: boolean;
  dryRun: boolean;
  email: string;
  env: GrantEnv;
}

export function parseGrantArgs(argv: readonly string[]): GrantArgs {
  let env: string | undefined;
  let dryRun = false;
  let create = false;
  let expectEnv = false;
  const emails: string[] = [];
  for (const arg of argv) {
    if (expectEnv) {
      env = arg;
      expectEnv = false;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--create") {
      create = true;
    } else if (arg === "--env") {
      expectEnv = true;
    } else if (arg.startsWith("--env=")) {
      env = arg.slice("--env=".length);
    } else if (arg.startsWith("--")) {
      throw new Error(`[adminGrant] Unknown option ${JSON.stringify(arg)}`);
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
  return { create, dryRun, email, env };
}

/** What `--dry-run` prints: the command, then what it does besides. */
export function dryRunLines(
  args: GrantArgs,
  command: readonly string[] = buildGrantCommand(args.env, args.email, {
    create: args.create,
  })
): string[] {
  const shown = command.map((arg) => JSON.stringify(arg)).join(" ");
  return [
    `(cd apps/site && bunx ${shown})`,
    UNBAN_NOTE,
    ...(args.create ? [CREATE_NOTE] : []),
  ];
}

function run(args: GrantArgs): void {
  const command = buildGrantCommand(args.env, args.email, {
    create: args.create,
  });
  if (args.dryRun) {
    for (const line of dryRunLines(args, command)) {
      console.log(line);
    }
    return;
  }
  console.log(UNBAN_NOTE);
  if (args.create) {
    console.log(CREATE_NOTE);
  }
  const proc = Bun.spawnSync(["bunx", ...command], {
    cwd: join(import.meta.dir, "..", "apps", "site"),
    stdio: ["inherit", "inherit", "inherit"],
  });
  if (proc.exitCode !== 0) {
    throw new Error(`[adminGrant] wrangler exited with ${proc.exitCode}`);
  }
  console.log(
    args.create
      ? "[adminGrant] Done. A created_id row means the account was created; the last result shows its role."
      : "[adminGrant] Done. An empty result means no account has that email."
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
      "Usage: bun run admin:grant --env <dev|staging|production> [--create] [--dry-run] <email>"
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
