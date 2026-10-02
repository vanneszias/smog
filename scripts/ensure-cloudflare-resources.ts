import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `bun scripts/ensure-cloudflare-resources.ts --env <staging|production>
 *   --create | --check | --dry-run`
 *
 * The bindings `apps/site/wrangler.jsonc` names that `wrangler deploy`
 * does not create: the queues and their DLQs, and the R2 bucket with its
 * CORS (phase 6 ruling 12). It reads the env's config and asks wrangler
 * what exists (`queues info`, `r2 bucket info`, `r2 bucket cors list`):
 *
 * - `--create` creates what is missing (`queues create`, `r2 bucket
 *   create`, and `r2 bucket cors set` on a bucket that has no CORS). It
 *   never deletes or changes anything that exists: an existing CORS that
 *   differs is reported, not overwritten. Production needs
 *   `SMOG_PROVISION_PRODUCTION=1` as well (the repository variable of the
 *   same name, `deploy.yml`).
 * - `--check` creates nothing and fails, printing the exact commands, when
 *   anything is missing (`deploy.yml` runs it for production by default).
 * - `--dry-run` calls nothing and prints every command it could run.
 *
 * Wrangler runs from `apps/site` with the deploy job's
 * `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
 */

const DEPLOY_ENVS = ["staging", "production"] as const;
export type DeployEnv = (typeof DEPLOY_ENVS)[number];
export type EnsureMode = "create" | "check" | "dry-run";

export interface WranglerResult {
  code: number;
  stderr: string;
  stdout: string;
}

/** Runs `wrangler <args>` (tests pass a fake). */
export type WranglerRunner = (args: string[]) => Promise<WranglerResult>;

export interface ResourcePlan {
  buckets: { corsOrigin: string; name: string }[];
  /** Producers, consumers and DLQs, without repeats, sorted. */
  queues: string[];
}

interface Logger {
  log: (line: string) => void;
  warn: (line: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(...values: unknown[]): string[] {
  return values.filter((value): value is string => typeof value === "string");
}

/** What `env.<env>` of `wrangler.jsonc` needs to exist before a deploy. */
export function planResources(source: string, env: DeployEnv): ResourcePlan {
  const config: unknown = Bun.JSONC.parse(source);
  const envs = isRecord(config) && isRecord(config.env) ? config.env : {};
  const target = isRecord(envs[env]) ? envs[env] : {};
  const queues = isRecord(target.queues) ? target.queues : {};
  const names = [
    ...records(queues.producers).flatMap((producer) => strings(producer.queue)),
    ...records(queues.consumers).flatMap((consumer) =>
      strings(consumer.queue, consumer.dead_letter_queue)
    ),
  ];
  const vars = isRecord(target.vars) ? target.vars : {};
  const siteUrl = typeof vars.SITE_URL === "string" ? vars.SITE_URL : "";
  const origin = siteUrl ? new URL(siteUrl).origin : "";
  return {
    buckets: records(target.r2_buckets).flatMap((bucket) =>
      strings(bucket.bucket_name).map((name) => ({ corsOrigin: origin, name }))
    ),
    queues: [...new Set(names)].sort(),
  };
}

/**
 * The bucket's CORS (ruling 10): the browser's presigned `PUT` from the
 * site, with the signed `content-type`. Nothing else is allowed.
 */
export function corsRules(origin: string) {
  return {
    rules: [
      {
        allowed: {
          headers: ["content-type"],
          methods: ["PUT"],
          origins: [origin],
        },
        maxAgeSeconds: 3600,
      },
    ],
  };
}

const QUEUE_MISSING = /does not exist/i;
const BUCKET_MISSING = /bucket does not exist|code: 10006|NoSuchBucket/i;
const CORS_NONE = /There is no CORS configuration/i;
const CORS_MISSING =
  /code: 10059|CORS configuration does not exist|NoSuchCORSConfiguration/i;

function output(result: WranglerResult): string {
  return `${result.stdout}\n${result.stderr}`.trim();
}

function lookupFailed(what: string, result: WranglerResult): Error {
  return new Error(
    `[ensure] Failed to look up ${what} (wrangler exited ${result.code}): ${output(result)}`
  );
}

async function queueExists(
  run: WranglerRunner,
  name: string
): Promise<boolean> {
  const result = await run(["queues", "info", name]);
  if (result.code === 0 && result.stdout.includes(name)) {
    return true;
  }
  if (result.code !== 0 && QUEUE_MISSING.test(output(result))) {
    return false;
  }
  throw lookupFailed(`the queue ${name}`, result);
}

async function bucketExists(
  run: WranglerRunner,
  name: string
): Promise<boolean> {
  const result = await run(["r2", "bucket", "info", name, "--json"]);
  if (result.code === 0) {
    return true;
  }
  if (BUCKET_MISSING.test(output(result))) {
    return false;
  }
  throw lookupFailed(`the bucket ${name}`, result);
}

/** The bucket's CORS as wrangler lists it, or `null` when it has none. */
async function bucketCors(
  run: WranglerRunner,
  name: string
): Promise<string | null> {
  const result = await run(["r2", "bucket", "cors", "list", name]);
  if (result.code === 0) {
    return CORS_NONE.test(result.stdout) ? null : result.stdout;
  }
  if (CORS_MISSING.test(output(result))) {
    return null;
  }
  throw lookupFailed(`the CORS of ${name}`, result);
}

function shown(args: string[]): string {
  return `(cd apps/site && bunx wrangler ${args.join(" ")})`;
}

const CORS_FILE = "<cors.json>";

/** `--no-update-config`: wrangler must not offer to edit wrangler.jsonc. */
function bucketCreateArgs(bucket: string): string[] {
  return ["r2", "bucket", "create", bucket, "--no-update-config"];
}

function corsSetArgs(bucket: string, file: string): string[] {
  return ["r2", "bucket", "cors", "set", bucket, "--file", file, "--force"];
}

async function runCreate(run: WranglerRunner, args: string[]): Promise<void> {
  const result = await run(args);
  if (result.code !== 0) {
    throw new Error(
      `[ensure] Failed to run wrangler ${args.join(" ")} (exit ${result.code}): ${output(result)}`
    );
  }
}

async function setCors(
  run: WranglerRunner,
  bucket: { corsOrigin: string; name: string }
): Promise<void> {
  const file = join(
    tmpdir(),
    `smog-cors-${bucket.name}-${crypto.randomUUID()}.json`
  );
  writeFileSync(file, JSON.stringify(corsRules(bucket.corsOrigin)));
  try {
    await runCreate(run, corsSetArgs(bucket.name, file));
  } finally {
    rmSync(file, { force: true });
  }
}

export interface EnsureResult {
  /** What this run created (`cors:<bucket>` for a CORS policy). */
  created: string[];
  /** What is missing and was not created (`--check`). */
  missing: string[];
  ok: boolean;
}

export interface EnsureOptions {
  env: DeployEnv;
  log: Logger;
  mode: EnsureMode;
  plan: ResourcePlan;
  run: WranglerRunner;
}

function dryRun({ log, plan }: EnsureOptions): EnsureResult {
  for (const name of plan.queues) {
    log.log(shown(["queues", "info", name]));
    log.log(`  if missing: ${shown(["queues", "create", name])}`);
  }
  for (const bucket of plan.buckets) {
    log.log(shown(["r2", "bucket", "info", bucket.name, "--json"]));
    log.log(`  if missing: ${shown(bucketCreateArgs(bucket.name))}`);
    log.log(shown(["r2", "bucket", "cors", "list", bucket.name]));
    log.log(
      `  if none: ${shown(corsSetArgs(bucket.name, CORS_FILE))} with ${JSON.stringify(corsRules(bucket.corsOrigin))}`
    );
  }
  return { created: [], missing: [], ok: true };
}

interface BucketState {
  bucket: ResourcePlan["buckets"][number];
  cors: boolean;
  exists: boolean;
}

interface Lookup {
  buckets: BucketState[];
  missingQueues: string[];
}

/**
 * Every lookup, one wrangler call at a time (in order, so the log reads
 * like the plan). A lookup it cannot read throws before anything changes.
 */
async function lookUp(
  run: WranglerRunner,
  plan: ResourcePlan,
  log: Logger
): Promise<Lookup> {
  const missingQueues: string[] = [];
  for (const name of plan.queues) {
    // biome-ignore lint/performance/noAwaitInLoops: one wrangler call at a time.
    if (!(await queueExists(run, name))) {
      missingQueues.push(name);
    }
  }
  const buckets: BucketState[] = [];
  for (const bucket of plan.buckets) {
    // biome-ignore lint/performance/noAwaitInLoops: one wrangler call at a time.
    const exists = await bucketExists(run, bucket.name);
    const cors = exists ? await bucketCors(run, bucket.name) : null;
    const allowsPut =
      cors?.includes(bucket.corsOrigin) === true && cors.includes("PUT");
    if (cors !== null && !allowsPut) {
      log.warn(
        `${bucket.name} already has a CORS configuration that may not allow PUT from ${bucket.corsOrigin}; it is left as it is. Compare with ${JSON.stringify(corsRules(bucket.corsOrigin))}.`
      );
    }
    buckets.push({ bucket, cors: cors !== null, exists });
  }
  return { buckets, missingQueues };
}

function missingOf({ buckets, missingQueues }: Lookup): string[] {
  return [
    ...missingQueues,
    ...buckets
      .filter((entry) => !entry.exists)
      .map((entry) => entry.bucket.name),
    ...buckets
      .filter((entry) => !entry.cors)
      .map((entry) => `cors:${entry.bucket.name}`),
  ];
}

/** `--check`: what is missing, with the commands that would create it. */
function report(env: DeployEnv, lookup: Lookup, log: Logger): EnsureResult {
  const missing = missingOf(lookup);
  if (missing.length === 0) {
    log.log(`[ensure] ${env}: every queue and bucket exists.`);
    return { created: [], missing: [], ok: true };
  }
  log.warn(
    `[ensure] ${env} is missing ${missing.join(", ")}. Create them with:`
  );
  for (const name of lookup.missingQueues) {
    log.warn(`  ${shown(["queues", "create", name])}`);
  }
  for (const { bucket, cors, exists } of lookup.buckets) {
    if (!exists) {
      log.warn(`  ${shown(bucketCreateArgs(bucket.name))}`);
    }
    if (!cors) {
      log.warn(
        `  ${shown(corsSetArgs(bucket.name, "cors.json"))}   # cors.json: ${JSON.stringify(corsRules(bucket.corsOrigin))}`
      );
    }
  }
  log.warn(
    "  or set the repository variable SMOG_PROVISION_PRODUCTION=1 so the deploy creates them."
  );
  return { created: [], missing, ok: false };
}

/** `--create`: creates what the lookup found missing, one call at a time. */
async function create(
  env: DeployEnv,
  lookup: Lookup,
  run: WranglerRunner,
  log: Logger
): Promise<EnsureResult> {
  const created: string[] = [];
  for (const name of lookup.missingQueues) {
    // biome-ignore lint/performance/noAwaitInLoops: one wrangler call at a time; the first failure stops the run.
    await runCreate(run, ["queues", "create", name]);
    log.log(`[ensure] Created the queue ${name}`);
    created.push(name);
  }
  for (const { bucket, cors, exists } of lookup.buckets) {
    if (!exists) {
      // biome-ignore lint/performance/noAwaitInLoops: one wrangler call at a time; the first failure stops the run.
      await runCreate(run, bucketCreateArgs(bucket.name));
      log.log(`[ensure] Created the bucket ${bucket.name}`);
      created.push(bucket.name);
    }
    if (!cors) {
      await setCors(run, bucket);
      log.log(
        `[ensure] Set the CORS of ${bucket.name} (PUT from ${bucket.corsOrigin})`
      );
      created.push(`cors:${bucket.name}`);
    }
  }
  if (created.length === 0) {
    log.log(`[ensure] ${env}: every queue and bucket exists; nothing changed.`);
  }
  return { created, missing: [], ok: true };
}

/**
 * Looks up every resource first (a lookup it cannot read stops the run
 * before anything is created), then creates or reports what is missing.
 */
export async function ensureResources(
  options: EnsureOptions
): Promise<EnsureResult> {
  const { env, log, mode, plan, run } = options;
  if (mode === "dry-run") {
    return dryRun(options);
  }
  const lookup = await lookUp(run, plan, log);
  return mode === "check"
    ? report(env, lookup, log)
    : await create(env, lookup, run, log);
}

export function parseEnsureArgs(
  argv: readonly string[],
  environment: Record<string, string | undefined>
): { env: DeployEnv; mode: EnsureMode } {
  const at = argv.indexOf("--env");
  const env = at === -1 ? undefined : argv[at + 1];
  if (!DEPLOY_ENVS.includes(env as DeployEnv)) {
    throw new Error(
      `[ensure] --env must be staging or production (dev uses local resources), got ${JSON.stringify(env ?? null)}`
    );
  }
  const modes = (["create", "check", "dry-run"] as const).filter((flag) =>
    argv.includes(`--${flag}`)
  );
  const [mode] = modes;
  if (modes.length !== 1 || !mode) {
    throw new Error(
      "[ensure] pass exactly one mode: --create, --check or --dry-run"
    );
  }
  if (
    env === "production" &&
    mode === "create" &&
    environment.SMOG_PROVISION_PRODUCTION !== "1"
  ) {
    throw new Error(
      "[ensure] --create for production needs SMOG_PROVISION_PRODUCTION=1 (otherwise use --check)"
    );
  }
  return { env: env as DeployEnv, mode };
}

const SITE_DIR = join(import.meta.dir, "..", "apps", "site");

const bunxWrangler: WranglerRunner = async (args) => {
  const proc = Bun.spawn(["bunx", "wrangler", ...args], {
    cwd: SITE_DIR,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stderr, stdout };
};

if (import.meta.main) {
  try {
    const { env, mode } = parseEnsureArgs(process.argv.slice(2), process.env);
    const source = await Bun.file(join(SITE_DIR, "wrangler.jsonc")).text();
    const result = await ensureResources({
      env,
      log: { log: console.log, warn: console.warn },
      mode,
      plan: planResources(source, env),
      run: bunxWrangler,
    });
    if (!result.ok) {
      process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
