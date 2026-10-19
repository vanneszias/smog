/**
 * `bun run test:e2e [-- <playwright args>]`: the Playwright e2e suite of
 * `apps/site` (phase 9 ruling 1).
 *
 * The suite is five independent Playwright projects (`apps/site/playwright.config.ts`).
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

const PASS_WITH_NO_TESTS = "--pass-with-no-tests";

/**
 * `--project x` becomes `--project=x`: Playwright's `--project` is variadic,
 * so a positional file filter after it would be read as a second project.
 */
function singleTokenProjects(args: readonly string[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    const next = args[index + 1];
    if ((arg === "--project" || arg === "-p") && next !== undefined) {
      out.push(`--project=${next}`);
      index += 1;
    } else {
      out.push(arg);
    }
  }
  return out;
}

function allowEmpty(args: string[], allowed: boolean): string[] {
  return allowed && !args.includes(PASS_WITH_NO_TESTS)
    ? [...args, PASS_WITH_NO_TESTS]
    : args;
}

/**
 * The argument lists of the `test:e2e` commands to run, in order. A full run
 * puts the user's arguments first and `--project=<name>` last; any user
 * argument (a file filter, `--grep`) may match nothing in a project, which
 * must not stop the chain, so it also passes `--pass-with-no-tests`.
 */
export function planRuns(args: readonly string[]): string[][] {
  const requested = projectsIn(args);
  if (requested.length > 0) {
    const only = requested.every((name) => MAY_BE_EMPTY.has(name));
    return [allowEmpty(singleTokenProjects(args), only)];
  }
  return PROJECTS.map((name) =>
    allowEmpty(
      [...args, `--project=${name}`],
      args.length > 0 || MAY_BE_EMPTY.has(name)
    )
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
