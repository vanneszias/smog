import { join } from "node:path";

/**
 * `bun scripts/check-email-logo.ts --env <staging|production> [--warn-only]`
 *
 * After a deploy, fetches the email header logo the way a mail client or
 * an image proxy (Gmail, Outlook, Apple Mail Privacy Protection) does:
 * anonymously, without cookies, and without following a redirect. Every
 * email loads it from `<SITE_URL>/brand/email-logo.png`, so a `302` to a
 * login (Cloudflare Access on staging, issue #10), a `404` or an HTML page
 * is a broken image in every inbox. `deploy.yml` runs it after the deploy:
 * production enforces, staging only warns until its Access bypass covers
 * `/brand/*` (`docs/deployment.md` §8).
 */

const SITE_DIR = join(import.meta.dir, "..", "apps", "site");
const TAG = "[email-logo]";

/** `EMAIL_LOGO.path` of `@smog/email` (a test keeps the two equal). */
export const EMAIL_LOGO_PATH = "/brand/email-logo.png";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ATTEMPTS = 5;
const RETRY_DELAY_MS = 6000;
const TIMEOUT_MS = 15_000;

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** The logo URL of an env's `SITE_URL` in `wrangler.jsonc`. */
export function emailLogoUrl(wrangler: string, env: string): string {
  const config = Bun.JSONC.parse(wrangler) as {
    env?: Record<string, { vars?: { SITE_URL?: unknown } }>;
  };
  const siteUrl = config.env?.[env]?.vars?.SITE_URL;
  if (typeof siteUrl !== "string" || siteUrl === "") {
    throw new Error(`env.${env}.vars.SITE_URL is empty in wrangler.jsonc`);
  }
  return new URL(EMAIL_LOGO_PATH, siteUrl).toString();
}

/** Why a mail client could not show the logo at `url`, or `null` when it can. */
export async function emailLogoProblem(
  url: string,
  fetcher: Fetcher
): Promise<string | null> {
  const response = await fetcher(url, {
    credentials: "omit",
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location") ?? "";
    const access = location.includes("cloudflareaccess.com")
      ? ": Cloudflare Access asks for a login, so add /brand/* to the Access bypass (docs/deployment.md §8)"
      : "";
    return `${url} answers ${response.status} to ${new URL(location, url).origin}${access}`;
  }
  if (response.status !== 200) {
    return `${url} answers ${response.status}, not 200`;
  }
  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("image/png")) {
    return `${url} has content-type ${JSON.stringify(type)}, not image/png`;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return `${url} does not start with the PNG signature`;
  }
  return null;
}

async function probe(url: string, fetcher: Fetcher): Promise<string | null> {
  try {
    return await emailLogoProblem(url, fetcher);
  } catch (error) {
    return `${url} could not be fetched: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export interface Logger {
  error: (line: string) => void;
  log: (line: string) => void;
}

/** The command: 0 when the logo loads (or `--warn-only`), 1 otherwise. */
export async function runEmailLogoCheck(
  argv: readonly string[],
  fetcher: Fetcher,
  log: Logger,
  readWrangler: () => Promise<string> = () =>
    Bun.file(join(SITE_DIR, "wrangler.jsonc")).text(),
  retryDelayMs = RETRY_DELAY_MS
): Promise<number> {
  const env = argv[argv.indexOf("--env") + 1];
  const warnOnly = argv.includes("--warn-only");
  if (env !== "staging" && env !== "production") {
    log.error(`${TAG} --env must be staging or production`);
    return 1;
  }
  if (warnOnly && env === "production") {
    log.error(`${TAG} --warn-only is refused for production`);
    return 1;
  }
  let problem: string | null = null;
  try {
    const url = emailLogoUrl(await readWrangler(), env);
    // A fresh deploy can take a few seconds to reach every edge.
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: retries, one after another.
      problem = await probe(url, fetcher);
      if (!problem) {
        log.log(`${TAG} ${env}: ${url} loads anonymously`);
        return 0;
      }
      if (attempt < ATTEMPTS) {
        await Bun.sleep(retryDelayMs);
      }
    }
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
  if (warnOnly) {
    log.log(`::warning::${TAG} ${problem}`);
    return 0;
  }
  log.error(`${TAG} ${problem}`);
  return 1;
}

if (import.meta.main) {
  process.exit(
    await runEmailLogoCheck(process.argv.slice(2), fetch, {
      error: console.error,
      log: console.log,
    })
  );
}
