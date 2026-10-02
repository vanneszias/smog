import { join } from "node:path";
import {
  MAINTENANCE_KV_KEY,
  MAINTENANCE_MESSAGE_MAX,
  maintenanceSettingSchema,
  nextBypassVersion,
  parseMaintenanceSetting,
} from "@smog/config/maintenance";

/**
 * `bun run maintenance --env <dev|staging|production> on|off
 *   [--message <text>] [--until <ISO 8601>] [--dry-run] [--yes]`
 *
 * Writes the site's KV key `maintenance` (`MAINTENANCE_KV_KEY`, the
 * `MaintenanceSetting` of `@smog/config/maintenance`, shared with the Worker
 * and the admin settings page) with
 * `wrangler kv key put --binding KV` from `apps/site` (`--local` in dev,
 * `--remote` otherwise; spec §9, apps/site/src/worker/maintenance.ts).
 * It reads the current value first (`wrangler kv key get`): `on` keeps its
 * `bypassVersion`, `off` writes a new one (`nextBypassVersion`), so bypass
 * cookies last one window. Production needs `--yes`. `--dry-run` prints both commands
 * instead of running them (the version as a placeholder). Visitors
 * follow within about 2 minutes (30 s isolate cache, 30 s KV `cacheTtl`
 * and up to a minute of KV propagation).
 */

const ENVS = ["dev", "staging", "production"] as const;
type MaintenanceEnv = (typeof ENVS)[number];
type Action = "on" | "off";

export interface MaintenanceArgs {
  action: Action;
  dryRun: boolean;
  env: MaintenanceEnv;
  message?: string;
  until?: string;
  yes: boolean;
}

const USAGE =
  "Usage: bun run maintenance --env <dev|staging|production> on|off [--message <text>] [--until <ISO 8601>] [--dry-run] [--yes]";

function fail(message: string): never {
  throw new Error(`[maintenance] ${message}`);
}

function isEnv(value: string | undefined): value is MaintenanceEnv {
  return ENVS.includes(value as MaintenanceEnv);
}

function parseUntil(value: string, now: number): string {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    fail(`--until is not an ISO 8601 date: ${JSON.stringify(value)}`);
  }
  if (ms <= now) {
    fail(`--until is in the past: ${value}`);
  }
  return new Date(ms).toISOString();
}

interface RawArgs {
  actions: string[];
  dryRun: boolean;
  env?: string;
  message?: string;
  until?: string;
  yes: boolean;
}

const VALUE_FLAGS = new Set(["--env", "--message", "--until"]);

function readArgs(argv: readonly string[]): RawArgs {
  const raw: RawArgs = { actions: [], dryRun: false, yes: false };
  const set = (flag: string, value: string | undefined): void => {
    if (value === undefined) {
      fail(`${flag} needs a value`);
    }
    if (flag === "--env") {
      raw.env = value;
    } else if (flag === "--message") {
      raw.message = value;
    } else {
      raw.until = value;
    }
  };
  // The flag waiting for its value (`--env staging`).
  let pending: string | undefined;
  for (const arg of argv) {
    const cut = arg.indexOf("=");
    const flag = cut === -1 ? arg : arg.slice(0, cut);
    if (pending !== undefined) {
      set(pending, arg);
      pending = undefined;
    } else if (arg === "--dry-run") {
      raw.dryRun = true;
    } else if (arg === "--yes") {
      raw.yes = true;
    } else if (VALUE_FLAGS.has(flag)) {
      if (cut === -1) {
        pending = flag;
      } else {
        set(flag, arg.slice(cut + 1));
      }
    } else if (arg.startsWith("-")) {
      fail(`Unknown option ${arg}`);
    } else {
      raw.actions.push(arg);
    }
  }
  if (pending !== undefined) {
    set(pending, undefined);
  }
  return raw;
}

export function parseMaintenanceArgs(
  argv: readonly string[],
  now: number = Date.now()
): MaintenanceArgs {
  const raw = readArgs(argv);
  if (!isEnv(raw.env)) {
    fail(`Pass --env ${ENVS.join("|")} (got ${JSON.stringify(raw.env)})`);
  }
  const [action, ...rest] = raw.actions;
  if ((action !== "on" && action !== "off") || rest.length > 0) {
    fail("Pass exactly one action: on or off");
  }
  if (
    action === "off" &&
    (raw.message !== undefined || raw.until !== undefined)
  ) {
    fail("--message and --until only go with on");
  }
  if (raw.message !== undefined && raw.message.trim() === "") {
    fail("--message is empty");
  }
  if (
    raw.message !== undefined &&
    raw.message.trim().length > MAINTENANCE_MESSAGE_MAX
  ) {
    fail(`--message is longer than ${MAINTENANCE_MESSAGE_MAX} characters`);
  }
  if (raw.env === "production" && !raw.yes) {
    fail("Refusing to change production without --yes");
  }
  return {
    action,
    dryRun: raw.dryRun,
    env: raw.env,
    ...(raw.message === undefined ? {} : { message: raw.message.trim() }),
    ...(raw.until === undefined ? {} : { until: parseUntil(raw.until, now) }),
    yes: raw.yes,
  };
}

/** `bypassVersion` from `wrangler kv key get --text`, or null (no key). */
export function parseCurrentVersion(stdout: string): number | null {
  return parseMaintenanceSetting(stdout.trim())?.bypassVersion ?? null;
}

/**
 * The KV value (a `MaintenanceSetting`, checked with its schema). A string
 * version is only a `--dry-run` placeholder.
 */
export function buildMaintenanceValue(
  args: Pick<MaintenanceArgs, "action" | "message" | "until">,
  bypassVersion: number | string
): string {
  const value = {
    bypassVersion,
    enabled: args.action === "on",
    ...(args.message === undefined ? {} : { message: args.message }),
    ...(args.until === undefined ? {} : { until: args.until }),
  };
  return JSON.stringify(
    typeof bypassVersion === "number"
      ? maintenanceSettingSchema.parse(value)
      : value
  );
}

function target(env: MaintenanceEnv): string[] {
  return [
    "--binding",
    "KV",
    "--env",
    env,
    env === "dev" ? "--local" : "--remote",
  ];
}

/** Reads the current value (its `bypassVersion`). */
export function buildReadCommand(env: MaintenanceEnv): string[] {
  return [
    "wrangler",
    "kv",
    "key",
    "get",
    MAINTENANCE_KV_KEY,
    ...target(env),
    "--text",
  ];
}

/** The wrangler argv (no shell, so the JSON is one argument). */
export function buildMaintenanceCommand(
  env: MaintenanceEnv,
  value: string
): string[] {
  return [
    "wrangler",
    "kv",
    "key",
    "put",
    MAINTENANCE_KV_KEY,
    value,
    ...target(env),
  ];
}

const SITE_DIR = join(import.meta.dir, "..", "apps", "site");
const NOT_FOUND = /not found/i;

function shown(command: string[]): string {
  return `(cd apps/site && bunx ${command.map((arg) => JSON.stringify(arg)).join(" ")})`;
}

function readCurrentVersion(env: MaintenanceEnv): number | null {
  const proc = Bun.spawnSync(["bunx", ...buildReadCommand(env)], {
    cwd: SITE_DIR,
    stderr: "pipe",
    stdout: "pipe",
  });
  if (proc.exitCode !== 0) {
    // A missing key is not an error for `on` (first window) or `off`.
    const stderr = proc.stderr.toString();
    if (!NOT_FOUND.test(`${stderr}${proc.stdout.toString()}`)) {
      throw new Error(`[maintenance] Failed to read the key: ${stderr.trim()}`);
    }
    return null;
  }
  return parseCurrentVersion(proc.stdout.toString());
}

function run(args: MaintenanceArgs): void {
  if (args.dryRun) {
    const placeholder = args.action === "on" ? "<current>" : "<new>";
    console.log(shown(buildReadCommand(args.env)));
    console.log(
      shown(
        buildMaintenanceCommand(
          args.env,
          buildMaintenanceValue(args, placeholder)
        )
      )
    );
    return;
  }
  const version = nextBypassVersion(
    args.action === "on",
    readCurrentVersion(args.env)
  );
  const proc = Bun.spawnSync(
    [
      "bunx",
      ...buildMaintenanceCommand(
        args.env,
        buildMaintenanceValue(args, version)
      ),
    ],
    { cwd: SITE_DIR, stdio: ["inherit", "inherit", "inherit"] }
  );
  if (proc.exitCode !== 0) {
    throw new Error(`[maintenance] wrangler exited with ${proc.exitCode}`);
  }
  console.log(
    `[maintenance] ${args.env}: maintenance ${args.action} (bypassVersion ${version}). Visitors follow within about 2 minutes.`
  );
}

if (import.meta.main) {
  let args: MaintenanceArgs;
  try {
    args = parseMaintenanceArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(USAGE);
    process.exit(1);
  }
  try {
    run(args);
  } catch (error) {
    console.error("[maintenance] Failed to write the maintenance key:", error);
    process.exit(1);
  }
}
