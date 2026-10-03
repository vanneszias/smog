import { CRON, type CronName } from "@smog/jobs/cron";

/**
 * `bun run cron <expiry|reminders|stale|retention> [--url <dev server>]`
 *
 * Runs one Cron Trigger (`CRON`, phase 6 ruling 9) on the local dev server
 * (`bun -F @smog/site dev`): Miniflare's scheduled trigger,
 * `/cdn-cgi/local/scheduled?cron=<schedule>`, which calls the Worker's
 * `scheduled()` with that `controller.cron`. That is the current path in
 * `@cloudflare/vite-plugin` 1.62 and wrangler 4.143; the older
 * `/cdn-cgi/handler/scheduled` and `/cdn-cgi/mf/scheduled` are rewritten to
 * it. Local only: deployed crons run on Cloudflare's schedule.
 */

const DEFAULT_URL = "http://localhost:5173";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TRAILING_SLASHES = /\/+$/;

export interface CronArgs {
  name: CronName;
  url: string;
}

function isCronName(value: string | undefined): value is CronName {
  return value !== undefined && Object.hasOwn(CRON, value);
}

export function parseCronArgs(argv: readonly string[]): CronArgs {
  const at = argv.indexOf("--url");
  const url = (at === -1 ? DEFAULT_URL : (argv[at + 1] ?? "")).replace(
    TRAILING_SLASHES,
    ""
  );
  const name = argv.find(
    (arg, index) => !arg.startsWith("--") && (at === -1 || index !== at + 1)
  );
  if (!isCronName(name)) {
    throw new Error(
      `[cron] Name one of ${Object.keys(CRON).sort().join(", ")} (got ${JSON.stringify(name ?? null)})`
    );
  }
  if (!LOCAL_HOSTS.has(new URL(url).hostname)) {
    throw new Error(`[cron] --url must be a local dev server, got ${url}`);
  }
  return { name, url };
}

/** The dev server's scheduled trigger for one cron. */
export function cronUrl(base: string, name: CronName): string {
  return `${base}/cdn-cgi/local/scheduled?${new URLSearchParams({ cron: CRON[name] })}`;
}

export async function triggerCron(
  args: CronArgs,
  fetcher: (url: string) => Promise<Response> = (url) => fetch(url)
): Promise<void> {
  const url = cronUrl(args.url, args.name);
  const response = await fetcher(url);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `[cron] ${url} answered ${response.status}: ${body.trim()}`
    );
  }
  console.log(
    `[cron] ${args.name} (${CRON[args.name]}) ran: ${body.trim() || response.status}`
  );
}

if (import.meta.main) {
  try {
    await triggerCron(parseCronArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
