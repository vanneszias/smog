import { join } from "node:path";

/**
 * `bun run maintenance --env <dev|staging|production> on|off
 *   [--message <text>] [--until <ISO 8601>] [--dry-run] [--yes]`
 *
 * Writes the site's KV key `maintenance` with
 * `wrangler kv key put --binding KV` from `apps/site` (`--local` in dev,
 * `--remote` otherwise; spec §9, apps/site/src/worker/maintenance.ts).
 * Every write starts a new `bypassVersion` (the current Unix second), so
 * bypass cookies from an earlier window stop working. Production needs
 * `--yes`. `--dry-run` prints the command instead of running it. Isolates
 * pick the change up within about a minute (30 s isolate cache + 30 s KV
 * `cacheTtl`).
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

/** The KV value (`MaintenanceState` in the Worker). */
export function buildMaintenanceValue(
  args: Pick<MaintenanceArgs, "action" | "message" | "until">,
  now: number = Date.now()
): string {
  return JSON.stringify({
    bypassVersion: Math.floor(now / 1000),
    enabled: args.action === "on",
    ...(args.message === undefined ? {} : { message: args.message }),
    ...(args.until === undefined ? {} : { until: args.until }),
  });
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
    "maintenance",
    value,
    "--binding",
    "KV",
    "--env",
    env,
    env === "dev" ? "--local" : "--remote",
  ];
}

function run(args: MaintenanceArgs): void {
  const command = buildMaintenanceCommand(
    args.env,
    buildMaintenanceValue(args)
  );
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
    throw new Error(`[maintenance] wrangler exited with ${proc.exitCode}`);
  }
  console.log(
    `[maintenance] ${args.env}: maintenance ${args.action}. Isolates follow within about a minute.`
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
