/**
 * `bun run test:e2e [-- <playwright args>]`: the Playwright e2e suite of
 * `apps/site` (phase 9 ruling 1).
 *
 * The suite is four independent Playwright projects (`apps/site/playwright.config.ts`).
 * With no `--project`, this runs them one after another in `PROJECTS` order,
 * each as its own `bun -F @smog/site test:e2e` command, which carries its own
 * `test-deadline.ts` wrapper: the wrapper's 25 minutes apply per project, so
 * a full local run does not trip it. With `--project <name>` (or `-p`) it
 * runs exactly that, which is what a CI shard does. Every other argument is
 * passed to Playwright as given.
 *
 * Stops at the first failing project, like a chain of `&&` (the exit code
 * is that project's), unless `--keep-going` is given.
 */

/** The projects in the order a full run takes them; the config's names. */
export const PROJECTS = [
  "public",
  "a11y",
  "admin",
  "admin-a11y",
  "serial",
] as const;

/** `a11y` is empty until its specs land; an empty project is not an error. */
const MAY_BE_EMPTY = new Set<string>(["a11y"]);

const SITE_COMMAND = ["bun", "-F", "@smog/site", "test:e2e"];

function projectsIn(args: readonly string[]): string[] {
  const found: string[] = [];
  for (const [index, arg] of args.entries()) {
    if (arg === "--project" || arg === "-p") {
      const next = args[index + 1];
      if (next !== undefined) {
        found.push(next);
      }
    } else if (arg.startsWith("--project=")) {
      found.push(arg.slice("--project=".length));
    }
  }
  return found;
}

function withEmptyAllowance(args: string[], projects: string[]): string[] {
  const allEmptyOk =
    projects.length > 0 && projects.every((name) => MAY_BE_EMPTY.has(name));
  return allEmptyOk && !args.includes("--pass-with-no-tests")
    ? [...args, "--pass-with-no-tests"]
    : args;
}

/** The argument lists of the `test:e2e` commands to run, in order. */
export function planRuns(args: readonly string[]): string[][] {
  const requested = projectsIn(args);
  if (requested.length > 0) {
    return [withEmptyAllowance([...args], requested)];
  }
  return PROJECTS.map((name) =>
    withEmptyAllowance(["--project", name, ...args], [name])
  );
}

async function runAll(argv: readonly string[]): Promise<number> {
  const keepGoing = argv.includes("--keep-going");
  const args = argv.filter((arg) => arg !== "--keep-going");
  let exitCode = 0;
  for (const run of planRuns(args)) {
    console.log(`[e2e] ${[...SITE_COMMAND, ...run].join(" ")}`);
    // biome-ignore lint/performance/noAwaitInLoops: one project after the other, each on its own dev server.
    const code = await Bun.spawn([...SITE_COMMAND, ...run], {
      stderr: "inherit",
      stdin: "inherit",
      stdout: "inherit",
    }).exited;
    if (code !== 0) {
      exitCode = exitCode === 0 ? code : exitCode;
      if (!keepGoing) {
        return exitCode;
      }
    }
  }
  return exitCode;
}

if (import.meta.main) {
  process.exit(await runAll(process.argv.slice(2)));
}
