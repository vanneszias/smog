/**
 * The guards the Convex import CLI runs before it reads the export or
 * connects to anything. Each one exists for a way this import can go wrong
 * that no later check could undo.
 *
 * ## The export and the report stay outside the repository
 *
 * The export is real production data, and the report names catalogue rows
 * from it. Either one inside the git work tree is one `git add -A` away
 * from being committed, so both are refused there. Both are resolved
 * through symlinks before the comparison, because a link in `/tmp`
 * pointing into the checkout is the same file in the same place:
 *
 * - the export directory with `realpath`;
 * - the report, which may not exist yet, by `lstat` first. A report path
 *   that is itself a symlink is refused outright, dangling or not, since
 *   the write would follow it wherever it points (and a dangling link's
 *   target cannot be `realpath`ed). An existing file is `realpath`ed
 *   itself; a new one through its directory's `realpath`. The CLI then
 *   opens the report with `O_NOFOLLOW`, so a link swapped in after this
 *   check fails the write instead of following it.
 *
 * ## The target is named twice, and both names must agree
 *
 * `--target` says what the operator meant; `CLOUDFLARE_ENV` is what
 * `payload.config.ts` will actually resolve bindings for. They must match
 * exactly — `deploy:guard`'s rule, no trimming or case folding, because a
 * value that is nearly right is a mistake to report, not one to repair.
 *
 * - `local` writes to the locally emulated D1 under `.wrangler/state`.
 *   Bindings exist only under `staging` and `production` in
 *   `wrangler.jsonc`, so, like `bun -F site seed` (`src/seed/guard.ts`),
 *   local means `CLOUDFLARE_ENV=staging` with remote bindings off, which
 *   requires `NODE_ENV` not to be `production`.
 * - `staging` and `production` run against the real Cloudflare D1, the way
 *   `deploy:database` does (`NODE_ENV=production` → `remoteBindings`).
 * - `production` also requires `--i-have-a-maintenance-window`, dry run or
 *   not: the flag is a statement the operator makes before touching the
 *   production target at all, not a switch that only guards the write.
 */

import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync, type Stats, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const TARGETS = ["local", "staging", "production"] as const;

export type Target = (typeof TARGETS)[number];

export interface CliOptions {
  exportDir: string;
  reportPath: string;
  target: Target;
  apply: boolean;
  maintenanceWindow: boolean;
}

const USAGE =
  "Usage: bun -F site migrate:convex --export <dir> --report <file.md> " +
  "(absolute paths: bun -F runs in apps/site) " +
  "[--target=local|staging|production] [--apply] [--i-have-a-maintenance-window]";

function refuse(message: string): never {
  throw new Error(`[migrate-convex] Refusing: ${message}`);
}

function isTarget(value: string): value is Target {
  return (TARGETS as readonly string[]).includes(value);
}

export function parseCliArgs(argv: string[]): CliOptions {
  let values: ReturnType<typeof parse>["values"];
  try {
    values = parse(argv).values;
  } catch (error) {
    refuse(
      `${error instanceof Error ? error.message : String(error)}\n${USAGE}`
    );
  }

  if (!values.export) {
    refuse(`--export <dir> is required.\n${USAGE}`);
  }
  if (!values.report) {
    refuse(`--report <file.md> is required.\n${USAGE}`);
  }
  const target = values.target ?? "local";
  if (!isTarget(target)) {
    refuse(
      `--target must be exactly one of ${TARGETS.join(", ")} (got: '${target}').`
    );
  }

  return {
    exportDir: path.resolve(values.export),
    reportPath: path.resolve(values.report),
    target,
    apply: values.apply ?? false,
    maintenanceWindow: values["i-have-a-maintenance-window"] ?? false,
  };
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      export: { type: "string" },
      report: { type: "string" },
      target: { type: "string" },
      apply: { type: "boolean" },
      "i-have-a-maintenance-window": { type: "boolean" },
    },
  });
}

/** The work tree this CLI is checked out in, symlinks resolved. */
export function workTreeRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let top: string;
  try {
    top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: here,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    // Without the work tree there is nothing to compare against, and
    // "could not check" must not read as "checked and fine".
    refuse(
      `could not find the git work tree to keep the export out of (${error instanceof Error ? error.message : String(error)}).`
    );
  }
  return realpathSync(top);
}

/**
 * The real location `candidate` resolves to. The export must exist; the
 * report need not yet, but its directory must, so it is resolved through
 * that.
 */
function resolveReal(candidate: string, label: "export" | "report"): string {
  if (label === "export") {
    let real: string;
    try {
      real = realpathSync(candidate);
    } catch {
      refuse(`the export directory ${candidate} does not exist.`);
    }
    if (!statSync(real).isDirectory()) {
      refuse(`the export ${candidate} is not a directory.`);
    }
    return real;
  }
  const existing = lstatIfExists(candidate);
  if (existing?.isSymbolicLink()) {
    refuse(
      `the report ${candidate} is a symbolic link. Writing it would follow the link wherever it points; pass the real path of a file outside the repository.`
    );
  }
  if (existing) {
    return realpathSync(candidate);
  }
  const directory = path.dirname(candidate);
  let realDirectory: string;
  try {
    realDirectory = realpathSync(directory);
  } catch {
    refuse(`the report's directory ${directory} does not exist.`);
  }
  return path.join(realDirectory, path.basename(candidate));
}

function lstatIfExists(candidate: string): Stats | undefined {
  try {
    return lstatSync(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

export function assertOutsideWorkTree(
  candidate: string,
  label: "export" | "report",
  workTree: string
): void {
  const real = resolveReal(candidate, label);
  const relative = path.relative(workTree, real);
  const inside =
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative));
  if (inside) {
    refuse(
      `the ${label} ${candidate} is inside the git work tree (${workTree}). ` +
        "The export is real user data and the report names rows from it; keep both outside the repository."
    );
  }
}

/** The only `CLOUDFLARE_ENV` a local run may resolve (see the module doc). */
const LOCAL_CLOUDFLARE_ENV = "staging";
const LOCAL_NODE_ENVS = new Set(["development", "test"]);

const quote = (value: string | undefined): string =>
  value === undefined ? "unset" : `'${value}'`;

export function assertTargetAllowed(
  options: CliOptions,
  env: Record<string, string | undefined>
): void {
  const cloudflareEnv = env.CLOUDFLARE_ENV;

  if (options.target === "local") {
    if (cloudflareEnv !== LOCAL_CLOUDFLARE_ENV) {
      refuse(
        `--target=local needs CLOUDFLARE_ENV to be exactly '${LOCAL_CLOUDFLARE_ENV}' (got: ${quote(cloudflareEnv)}): ` +
          "it is the only binding set that is emulated on local disk. For a remote database, pass --target."
      );
    }
    const nodeEnv = env.NODE_ENV;
    if (nodeEnv !== undefined && !LOCAL_NODE_ENVS.has(nodeEnv)) {
      refuse(
        `--target=local needs NODE_ENV unset, 'development' or 'test' (got: ${quote(nodeEnv)}): ` +
          "NODE_ENV=production makes payload.config.ts resolve the remote Cloudflare database."
      );
    }
    return;
  }

  if (cloudflareEnv !== options.target) {
    refuse(
      `for --target=${options.target}, CLOUDFLARE_ENV must be exactly '${options.target}' (got: ${quote(cloudflareEnv)}). ` +
        "The two name the same database twice, so a mismatch is a mistake about which database this is."
    );
  }

  if (options.target === "production" && !options.maintenanceWindow) {
    refuse(
      "--target=production requires --i-have-a-maintenance-window: the production catalogue is written with no transactions, so run it only while nothing else writes."
    );
  }
}

/**
 * A JSON-with-comments reader for `wrangler.jsonc`: line and block comments
 * are dropped outside strings (the file holds `https://` URLs), then
 * trailing commas before `}` or `]`.
 */
export function parseJsonc(text: string): unknown {
  // Each pattern matches a whole string literal first, so a `//` or `,`
  // inside one is consumed with the string and put back unchanged.
  const withoutComments = text.replace(
    /("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (_match, literal: string | undefined) => literal ?? ""
  );
  const withoutTrailingCommas = withoutComments.replace(
    /("(?:\\.|[^"\\])*")|,(\s*[}\]])/g,
    (_match, literal: string | undefined, closing: string | undefined) =>
      literal ?? closing ?? ""
  );
  return JSON.parse(withoutTrailingCommas);
}

interface WranglerConfig {
  env?: Record<
    string,
    { d1_databases?: Array<{ binding?: string; database_name?: string }> }
  >;
}

/** The D1 database `target` writes to, named as `wrangler.jsonc` names it. */
export function databaseNameFor(target: Target, wranglerJsonc: string): string {
  const config = parseJsonc(wranglerJsonc) as WranglerConfig;
  const environment = target === "local" ? LOCAL_CLOUDFLARE_ENV : target;
  const database = config.env?.[environment]?.d1_databases?.find(
    (entry) => entry.binding === "D1"
  );
  if (!database?.database_name) {
    refuse(`wrangler.jsonc has no D1 binding under env.${environment}.`);
  }
  return target === "local"
    ? `${database.database_name} (local emulation under .wrangler/state, not the remote database)`
    : `${database.database_name} (remote)`;
}
