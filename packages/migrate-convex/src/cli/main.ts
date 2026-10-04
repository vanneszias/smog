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
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { InputError } from "../core/inputs";
import { plan } from "../core/plan";
import { isTarget, type Target } from "../core/target";
import { readExport } from "./read-export";

export const USAGE = `Usage: bun run migrate:convex <command> [options]

Every command that writes outside the plan folder is dry by default.
Every path must be absolute (the command runs from packages/migrate-convex).

Commands:
  plan --export <zip|dir> --target <staging|production> --out <dir>
       [--now <ISO>] [--workos-users <file>] [--mux-map <file>]
       [--overrides <overlay-overrides.json>] [--report-only]
      Read a Convex export and write the report and the SQL batches.
      Touches nothing remote. A staging plan is always pseudonymised.
  apply --env <dev|staging|production> --out <dir> [--dry-run] [--yes] [--reset]
      Preflight, then apply a plan to D1 (production needs --yes).
  mux scan --export <zip|dir> --out <dir>
      Count the Mux assets the export uses (read-only).
  mux renditions --map <file> [--apply]
      Enable static renditions on the imported assets (billable; dry without --apply).
  we-moved --out <dir> --env production [--apply]
      Queue the one-time "we moved" email (production only; dry without --apply).
  help
      Print this text.
`;

export interface Output {
  error: (text: string) => void;
  log: (text: string) => void;
}

type Command = (argv: readonly string[], out: Output) => Promise<number>;

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

/** The commands and, for those still to come, the phase 8 task that builds each. */
const COMMANDS: Record<string, Command | number> = {
  apply: 10,
  mux: 9,
  plan: planCommand,
  "we-moved": 9,
};

/** Runs the CLI with `argv` (without `bun` and the script) and returns the exit code. */
export async function main(
  argv: readonly string[],
  out: Output = console
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
    return await entry(rest, out);
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
