/**
 * `bun run migrate:convex <command>` (phase 8 ruling 6): the Convex → D1
 * importer's entry point. Bun only. Each command arrives with its task:
 * `plan` (task 5), `mux` and `we-moved` (task 9), `apply` (task 10); until
 * then a command prints that it is not built yet.
 *
 * `bun -F` runs this from `packages/migrate-convex`, not from where the
 * command was typed, so a relative path would silently resolve against
 * the package. Every path option must therefore be absolute (task 1
 * review M6); a relative one is refused with that reason.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { validateExport } from "../core/export-schema";
import { InputError } from "../core/inputs";
import { plan } from "../core/plan";
import { isTarget, type Target } from "../core/target";
import { runMuxRenditions, runMuxScan } from "./mux";
import { readExport } from "./read-export";
import { type ProcessEnv, realTimer, type Timer } from "./remote";
import { runWeMoved } from "./we-moved";
import { type CommandRunner, createWrangler } from "./wrangler";

export const USAGE = `Usage: bun run migrate:convex <command> [options]

Every command that writes outside the plan folder is dry by default.
Every path must be absolute (the command runs from packages/migrate-convex).

Commands:
  plan --export <zip|dir> --target <staging|production> --out <dir>
       [--now <ISO>] [--workos-users <file>] [--mux-map <file>]
       [--overrides <overlay-overrides.json>] [--report-only]
      Read a Convex export and write the report and the SQL batches.
      Touches nothing remote. A staging plan is always pseudonymised.
      --now defaults to the current time (recorded in manifest.json); pass
      it to get byte-identical plans from the same inputs.
  apply --env <dev|staging|production> --out <dir> [--dry-run] [--yes] [--reset]
      Preflight, then apply a plan to D1 (production needs --yes).
  mux scan --export <zip|dir> --out <dir>
      Look up every playback id of the export in Mux (read-only) and write
      mux-map.json (plan's --mux-map) and mux-scan.json to --out.
      Needs MUX_TOKEN_ID and MUX_TOKEN_SECRET (production's Mux environment).
  mux renditions --map <mux-map.json> [--apply]
      Request a \`highest\` static rendition on each gesture asset of the map
      that has none (billable; dry without --apply). Ledger:
      renditions-ledger.json beside the map. Needs MUX_TOKEN_ID and
      MUX_TOKEN_SECRET.
  we-moved --out <dir> --env production [--apply]
      Queue the one-time "we moved" email to every migrated account
      (production only, for a production plan; dry without --apply).
      Ledger: we-moved-ledger.json in --out. Needs CLOUDFLARE_API_TOKEN
      (Queues: Edit, D1) and CLOUDFLARE_ACCOUNT_ID.
  help
      Print this text.
`;

export interface Output {
  error: (text: string) => void;
  log: (text: string) => void;
}

/** What the commands that reach outside the plan folder use (fakes in tests). */
export interface CommandContext {
  readonly env: ProcessEnv;
  readonly fetch: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;
  readonly runWrangler?: CommandRunner;
  readonly timer: Timer;
  /** `apps/site/wrangler.jsonc` unless a test points elsewhere. */
  readonly wranglerConfigPath?: string;
}

const DEFAULT_CONTEXT: CommandContext = {
  env: process.env,
  fetch: (input, init) => fetch(input, init),
  timer: realTimer,
};

type Command = (
  argv: readonly string[],
  out: Output,
  context: CommandContext
) => Promise<number>;

class UsageError extends Error {}

interface ParsedOptions {
  readonly flags: ReadonlySet<string>;
  readonly values: ReadonlyMap<string, string>;
}

/** `--name value` and `--flag` options; an unknown or repeated one is a usage error. */
function parseOptions(
  argv: readonly string[],
  valueOptions: readonly string[],
  flagOptions: readonly string[]
): ParsedOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (flagOptions.includes(arg)) {
      flags.add(arg);
      continue;
    }
    if (!valueOptions.includes(arg)) {
      throw new UsageError(`Unknown option: ${arg}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    if (values.has(arg)) {
      throw new UsageError(`${arg} is given twice`);
    }
    values.set(arg, value);
    index += 1;
  }
  return { flags, values };
}

/** An absolute path option (see the module comment). */
function absolutePath(
  options: ParsedOptions,
  name: string,
  required: true
): string;
function absolutePath(
  options: ParsedOptions,
  name: string,
  required: false
): string | undefined;
function absolutePath(
  options: ParsedOptions,
  name: string,
  required: boolean
): string | undefined {
  const value = options.values.get(name);
  if (value === undefined) {
    if (required) {
      throw new UsageError(`${name} is required`);
    }
    return;
  }
  if (!isAbsolute(value)) {
    throw new UsageError(
      `${name} must be an absolute path: the command runs from packages/migrate-convex, so a relative path would not mean what you typed (try "$PWD/${value}")`
    );
  }
  return value;
}

/** The files a plan writes; anything else in the folder is left alone. */
const PLAN_FILE =
  /^(report\.(json|md)|manifest\.json|\d\d-[a-z]+-\d{3}\.sql|reset-imported-\d{3}\.sql)$/;

async function readText(path: string | undefined): Promise<string | undefined> {
  return path === undefined ? undefined : await Bun.file(path).text();
}

const planCommand: Command = async (argv, out) => {
  const options = parseOptions(
    argv,
    [
      "--export",
      "--target",
      "--out",
      "--now",
      "--workos-users",
      "--mux-map",
      "--overrides",
    ],
    ["--report-only"]
  );
  const exportPath = absolutePath(options, "--export", true);
  const outDir = absolutePath(options, "--out", true);
  const target = options.values.get("--target");
  if (target === undefined || !isTarget(target)) {
    throw new UsageError("--target must be staging or production");
  }
  const nowText = options.values.get("--now");
  const now = nowText === undefined ? new Date() : new Date(nowText);
  if (Number.isNaN(now.getTime())) {
    throw new UsageError("--now must be an ISO date-time");
  }
  const result = await plan({
    export: await readExport(exportPath),
    muxMap: await readText(absolutePath(options, "--mux-map", false)),
    now,
    overrides: await readText(absolutePath(options, "--overrides", false)),
    reportOnly: options.flags.has("--report-only"),
    target: target as Target,
    workosUsers: await readText(absolutePath(options, "--workos-users", false)),
  });
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(outDir)) {
    if (PLAN_FILE.test(name)) {
      rmSync(join(outDir, name));
    }
  }
  await Promise.all(
    [...result.files].map(([name, content]) =>
      Bun.write(join(outDir, name), content)
    )
  );
  const { report } = result;
  out.log(
    `[migrate-convex] plan (${report.target}, now ${report.now}): ${report.blockers} blocker(s), ${report.warnings} warning(s); ${result.files.size} file(s) written to ${outDir}.`
  );
  if (report.blockers > 0) {
    out.error(
      "[migrate-convex] The plan has blockers (report.md lists them); apply refuses it."
    );
    return 1;
  }
  return 0;
};

const muxCommand: Command = async (argv, out, context) => {
  const [sub, ...rest] = argv;
  if (sub === "scan") {
    const options = parseOptions(rest, ["--export", "--out"], []);
    const exportPath = absolutePath(options, "--export", true);
    const outDir = absolutePath(options, "--out", true);
    const { data } = validateExport(await readExport(exportPath));
    return await runMuxScan({ data, outDir }, context, out);
  }
  if (sub === "renditions") {
    const options = parseOptions(rest, ["--map"], ["--apply"]);
    const mapPath = absolutePath(options, "--map", true);
    return await runMuxRenditions(
      {
        apply: options.flags.has("--apply"),
        mapPath,
        mapText: readFileSync(mapPath, "utf8"),
      },
      context,
      out
    );
  }
  throw new UsageError("mux needs scan or renditions");
};

const weMovedCommand: Command = async (argv, out, context) => {
  const options = parseOptions(argv, ["--out", "--env"], ["--apply"]);
  const outDir = absolutePath(options, "--out", true);
  const env = options.values.get("--env");
  if (env === undefined) {
    throw new UsageError(
      "--env is required (we-moved runs on production only)"
    );
  }
  // runWeMoved refuses every env but production before it reads anything.
  return await runWeMoved(
    { apply: options.flags.has("--apply"), env, outDir },
    {
      ...context,
      wrangler: createWrangler("production", context.runWrangler),
    },
    out
  );
};

/** The commands and, for those still to come, the phase 8 task that builds each. */
const COMMANDS: Record<string, Command | number> = {
  apply: 10,
  mux: muxCommand,
  plan: planCommand,
  "we-moved": weMovedCommand,
};

/** Runs the CLI with `argv` (without `bun` and the script) and returns the exit code. */
export async function main(
  argv: readonly string[],
  out: Output = console,
  context: CommandContext = DEFAULT_CONTEXT
): Promise<number> {
  const [command, ...rest] = argv;
  if (
    command === undefined ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    out.log(USAGE);
    return command === undefined ? 2 : 0;
  }
  const entry = COMMANDS[command];
  if (entry === undefined) {
    out.error(`[migrate-convex] Unknown command: ${command}\n\n${USAGE}`);
    return 2;
  }
  if (typeof entry === "number") {
    out.error(
      `[migrate-convex] \`${command}\` is not built yet (phase 8 task ${entry}).`
    );
    return 1;
  }
  try {
    return await entry(rest, out, context);
  } catch (error) {
    if (error instanceof UsageError) {
      out.error(`[migrate-convex] ${error.message}\n\n${USAGE}`);
      return 2;
    }
    if (error instanceof InputError) {
      out.error(error.message);
      return 2;
    }
    out.error(
      `[migrate-convex] Failed to run ${command}: ${error instanceof Error ? error.message : String(error)}`
    );
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
