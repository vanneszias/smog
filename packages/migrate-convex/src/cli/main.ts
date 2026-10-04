/**
 * `bun run migrate:convex <command>` (phase 8 ruling 6): the Convex → D1
 * importer's entry point. Bun only. Each command arrives with its task:
 * `plan` (task 5), `mux` and `we-moved` (task 9), `apply` (task 10); until
 * then it prints the usage and says the command is not built yet.
 *
 * `bun -F` runs this from `packages/migrate-convex`, so relative paths
 * resolve from there (where `out/` is gitignored). Give the export and
 * the other inputs as absolute paths.
 */

export const USAGE = `Usage: bun run migrate:convex <command> [options]

Every command that writes outside the plan folder is dry by default.
Relative paths resolve from packages/migrate-convex.

Commands:
  plan --export <zip|dir> --target <staging|production> --out <dir>
       [--now <ISO>] [--workos-users <file>] [--mux-map <file>]
       [--overrides <overlay-overrides.json>] [--report-only]
      Read a Convex export and write the report and the SQL batches.
      Touches nothing remote.
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

/** The commands and the phase 8 task that builds each. */
const COMMANDS: Record<string, number> = {
  apply: 10,
  mux: 9,
  plan: 5,
  "we-moved": 9,
};

interface Output {
  error: (text: string) => void;
  log: (text: string) => void;
}

/** Runs the CLI with `argv` (without `bun` and the script) and returns the exit code. */
export function main(argv: readonly string[], out: Output = console): number {
  const [command] = argv;
  if (
    command === undefined ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    out.log(USAGE);
    return command === undefined ? 2 : 0;
  }
  const task = COMMANDS[command];
  if (task === undefined) {
    out.error(`[migrate-convex] Unknown command: ${command}\n\n${USAGE}`);
    return 2;
  }
  out.error(
    `[migrate-convex] \`${command}\` is not built yet (phase 8 task ${task}).`
  );
  return 1;
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2));
}
