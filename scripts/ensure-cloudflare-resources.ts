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
 * what exists (`queues info`, `r2 bucket list`, `r2 bucket cors list`):
 *
 * - `--create` creates what is missing (`queues create`, `r2 bucket
 *   create`, and `r2 bucket cors set` on a bucket that has no CORS). It
 *   never deletes or changes anything that exists. A CORS that does not
 *   allow the PUT from `SITE_URL` fails the run with the command that
 *   fixes it, and is never overwritten. Production needs
 *   `SMOG_PROVISION_PRODUCTION=1` as well (the repository variable of the
 *   same name, `deploy.yml`) and a `SITE_URL` that is not the placeholder.
 * - `--check` creates nothing and fails, printing the exact commands, when
 *   anything is missing (`deploy.yml` runs it for production by default).
 * - `--dry-run` calls nothing and prints every command it could run.
 *
 * Wrangler runs from `apps/site` with the deploy job's
 * `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Prerequisites: the
 * Workers Paid plan (Queues), R2 enabled on the account, and a token with
 * Workers R2 Storage: Edit and Workers Scripts: Edit (or Queues: Edit).
 * A refusal names the one that is missing (`[provision]` hints).
 *
 * The render pipeline (phase 7 ruling 2): only when the env's `RENDER_MODE`
 * is `container` and `SMOG_RENDER_PIPELINE=1` (the GitHub environment
 * variable `deploy.yml` passes), it first checks, read only, that the token
 * reaches Workflows (`wrangler workflows list`), that Docker runs
 * (`docker info`) and that Containers are reachable (`wrangler containers
 * list`), and stops with a `[provision] Workflows: …` or `[provision]
 * Containers: …` line otherwise. It creates neither: the deploy does. With
 * the gate off it runs nothing new.
 */

const DEPLOY_ENVS = ["staging", "production"] as const;
export type DeployEnv = (typeof DEPLOY_ENVS)[number];
export type EnsureMode = "create" | "check" | "dry-run";

export interface WranglerResult {
  code: number;
  stderr: string;
  stdout: string;
}

/** Runs a command with `args` (tests pass a fake). */
export type CommandRunner = (args: string[]) => Promise<WranglerResult>;

/** Runs `wrangler <args>` (tests pass a fake). */
export type WranglerRunner = CommandRunner;

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

/**
 * Production's `SITE_URL` until the launch domain is known
 * (`wrangler.jsonc`). The bucket's CORS cannot be set from it: it would
 * allow the logo PUT from an origin nobody uses.
 */
export const PRODUCTION_SITE_URL_PLACEHOLDER =
  "https://smog-site-production.workers.dev";

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
  const buckets = records(target.r2_buckets).flatMap((bucket) =>
    strings(bucket.bucket_name)
  );
  if (buckets.length > 0 && !siteUrl) {
    throw new Error(
      `[provision] env.${env}.vars.SITE_URL is empty: the bucket's CORS origin comes from it`
    );
  }
  const origin = siteUrl ? new URL(siteUrl).origin : "";
  return {
    buckets: buckets.map((name) => ({ corsOrigin: origin, name })),
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

/** wrangler's `[code: N]` of a Cloudflare API error. */
const BUCKET_TAKEN = /\[code: 10004\]/;
const CORS_NONE = /^There is no CORS configuration defined for bucket '/m;
const CORS_MISSING = /\[code: 10059\]/;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const LABELLED_LINE = /^\s*([a-z_]+):\s+(.*)$/;

/** `label:  value` of a `formatLabelledValues` line, or `null`. */
function labelled(line: string): { label: string; value: string } | null {
  if (!LABELLED_LINE.test(line)) {
    return null;
  }
  return {
    label: line.replace(LABELLED_LINE, "$1"),
    value: line.replace(LABELLED_LINE, "$2").trim(),
  };
}

/**
 * What to enable when wrangler is refused (I1): the account and token
 * prerequisites of the deploy step (AGENTS.md, DECISIONS).
 */
const PREREQUISITE_HINTS: { hint: string; pattern: RegExp }[] = [
  {
    hint: "[provision] R2 is not enabled on this account: enable R2 once in the Cloudflare dashboard (R2 Object Storage), then re-run the deploy.",
    pattern: /\[code: 10042\]|enable R2/i,
  },
  {
    hint: "[provision] Queues need the Workers Paid plan on this account.",
    pattern: /Workers Paid|paid plan/i,
  },
  {
    hint: "[provision] The API token (CLOUDFLARE_API_TOKEN) lacks a permission: it needs Account › Workers R2 Storage: Edit (the bucket and its CORS) and Account › Workers Scripts: Edit or Queues: Edit (the queues).",
    pattern:
      /\[code: 1000[01]\]|Authentication error|\(403\)|\b403 Forbidden\b|permission/i,
  },
];

function output(result: WranglerResult): string {
  return `${result.stdout}\n${result.stderr}`.replace(ANSI, "").trim();
}

function withHint(message: string, result: WranglerResult): Error {
  const text = output(result);
  const hints = PREREQUISITE_HINTS.filter(({ pattern }) =>
    pattern.test(text)
  ).map(({ hint }) => hint);
  return new Error([message, ...hints].join("\n"));
}

function lookupFailed(what: string, result: WranglerResult): Error {
  return withHint(
    `[provision] Failed to look up ${what} (wrangler exited ${result.code}): ${output(result)}`,
    result
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function queueExists(
  run: WranglerRunner,
  name: string
): Promise<boolean> {
  const result = await run(["queues", "info", name]);
  const quoted = escapeRegExp(name);
  if (
    result.code === 0 &&
    new RegExp(`^Queue Name: ${quoted}$`, "m").test(output(result))
  ) {
    return true;
  }
  if (
    result.code !== 0 &&
    new RegExp(`Queue "${quoted}" does not exist`).test(output(result))
  ) {
    return false;
  }
  throw lookupFailed(`the queue ${name}`, result);
}

/**
 * Every bucket of the account, from `r2 bucket list` (`name:` lines,
 * matched exactly). Not `r2 bucket info`, which also runs an analytics
 * query that needs another permission (M3).
 */
async function listBuckets(run: WranglerRunner): Promise<Set<string>> {
  const result = await run(["r2", "bucket", "list"]);
  if (result.code !== 0) {
    throw lookupFailed("the R2 buckets", result);
  }
  const names = new Set<string>();
  for (const line of output(result).split("\n")) {
    const entry = labelled(line);
    if (entry?.label === "name" && entry.value) {
      names.add(entry.value);
    }
  }
  return names;
}

/** One rule of `r2 bucket cors list` (`formatLabelledValues` blocks). */
interface CorsRule {
  headers: string[];
  methods: string[];
  origins: string[];
}

function parseCorsTable(text: string): CorsRule[] {
  const rules: CorsRule[] = [];
  let current: CorsRule | null = null;
  const list = (value: string) =>
    value.startsWith("(") ? [] : value.split(",").map((item) => item.trim());
  for (const line of text.split("\n")) {
    const { label, value } = labelled(line) ?? { label: "", value: "" };
    if (label === "allowed_origins") {
      current = { headers: [], methods: [], origins: list(value) };
      rules.push(current);
    } else if (current && label === "allowed_methods") {
      current.methods = list(value);
    } else if (current && label === "allowed_headers") {
      current.headers = list(value).map((header) => header.toLowerCase());
    }
  }
  return rules;
}

type CorsState = "none" | "ok" | "mismatch";

/** Whether the bucket's CORS allows the presigned PUT from `origin`. */
async function bucketCors(
  run: WranglerRunner,
  bucket: { corsOrigin: string; name: string }
): Promise<CorsState> {
  const result = await run(["r2", "bucket", "cors", "list", bucket.name]);
  const text = output(result);
  if (result.code !== 0) {
    if (CORS_MISSING.test(text)) {
      return "none";
    }
    throw lookupFailed(`the CORS of ${bucket.name}`, result);
  }
  if (CORS_NONE.test(text)) {
    return "none";
  }
  const allows = parseCorsTable(text).some(
    (rule) =>
      (rule.origins.includes(bucket.corsOrigin) ||
        rule.origins.includes("*")) &&
      rule.methods.includes("PUT") &&
      (rule.headers.includes("content-type") || rule.headers.includes("*"))
  );
  return allows ? "ok" : "mismatch";
}

function shown(args: string[]): string {
  return `(cd apps/site && bunx wrangler ${args.join(" ")})`;
}

function shownDocker(args: string[]): string {
  return `(cd apps/site && docker ${args.join(" ")})`;
}

const CORS_FILE = "<cors.json>";

/** `--no-update-config`: wrangler must not offer to edit wrangler.jsonc. */
function bucketCreateArgs(bucket: string): string[] {
  return ["r2", "bucket", "create", bucket, "--no-update-config"];
}

function corsSetArgs(bucket: string, file: string): string[] {
  return ["r2", "bucket", "cors", "set", bucket, "--file", file, "--force"];
}

function corsFix(bucket: { corsOrigin: string; name: string }): string {
  return `${shown(corsSetArgs(bucket.name, "cors.json"))}   # cors.json: ${JSON.stringify(corsRules(bucket.corsOrigin))}`;
}

async function runCreate(
  run: WranglerRunner,
  args: string[]
): Promise<WranglerResult> {
  const result = await run(args);
  if (result.code !== 0) {
    throw withHint(
      `[provision] Failed to run wrangler ${args.join(" ")} (exit ${result.code}): ${output(result)}`,
      result
    );
  }
  return result;
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
  /**
   * What is missing and was not created (`--check`), or wrong and never
   * overwritten (`cors-mismatch:<bucket>`, both modes).
   */
  missing: string[];
  ok: boolean;
}

export interface EnsureOptions {
  /** Runs `docker <args>` (only the render probes use it). */
  docker?: CommandRunner;
  env: DeployEnv;
  log: Logger;
  mode: EnsureMode;
  /**
   * The render pipeline is on for this deploy (`renderPipelineEnabled`):
   * probe Workflows, Docker and Containers before anything else.
   */
  pipeline?: boolean;
  plan: ResourcePlan;
  run: WranglerRunner;
}

/**
 * Whether this deploy turns the render pipeline on (phase 7 ruling 2): the
 * env's `RENDER_MODE` is `container` and `SMOG_RENDER_PIPELINE` is `1` (the
 * GitHub environment variable, `deploy.yml`). Only then does the build add
 * the Workflow and the Container (`apps/site/render-config.ts`).
 */
export function renderPipelineEnabled(
  source: string,
  env: DeployEnv,
  flag: string | undefined
): boolean {
  return renderModeOf(source, env) === "container" && flag === "1";
}

function renderModeOf(source: string, env: DeployEnv): unknown {
  const config: unknown = Bun.JSONC.parse(source);
  const envs = isRecord(config) && isRecord(config.env) ? config.env : {};
  const target = isRecord(envs[env]) ? envs[env] : {};
  const vars = isRecord(target.vars) ? target.vars : {};
  return vars.RENDER_MODE;
}

/**
 * The render gate's refusal, before anything runs: `RENDER_MODE=container`
 * without `SMOG_RENDER_PIPELINE=1` would fail the build in the Deploy step,
 * after the resources and the D1 migrations. The deploy job stops here
 * instead, at its first Cloudflare step. `null` when the gate holds.
 */
export function renderGateRefusal(
  source: string,
  env: DeployEnv,
  flag: string | undefined
): string | null {
  if (renderModeOf(source, env) !== "container" || flag === "1") {
    return null;
  }
  return `[provision] env.${env} has RENDER_MODE=container, which needs SMOG_RENDER_PIPELINE=1 (Workflows and Containers access confirmed; see PROGRESS owner actions). Nothing was run.`;
}

const WORKFLOWS_LIST = ["workflows", "list"];
const CONTAINERS_LIST = ["containers", "list"];
const DOCKER_INFO = ["info"];

/**
 * The render probes, read only: `wrangler workflows list` (the token
 * reaches Workflows), `docker info` (`wrangler deploy` builds the image) and
 * `wrangler containers list` (Containers are reachable). Nothing is created:
 * the deploy itself registers the Workflow and the container application.
 * Registry push is proven only by the first real deploy (owner action).
 */
async function probeRenderPipeline(
  env: DeployEnv,
  run: WranglerRunner,
  docker: CommandRunner,
  log: Logger
): Promise<void> {
  const workflows = await run(WORKFLOWS_LIST);
  if (workflows.code !== 0) {
    throw new Error(
      `[provision] Workflows: the token cannot list Workflows (wrangler workflows list exited ${workflows.code}): ${output(workflows)}\n[provision] Workflows: the ${env} CLOUDFLARE_API_TOKEN needs Workflows access (Account › Workers Scripts: Edit) before SMOG_RENDER_PIPELINE=1 (PROGRESS owner actions).`
    );
  }
  const info = await docker(DOCKER_INFO);
  if (info.code !== 0) {
    throw new Error(
      `[provision] Containers: Docker is not running in the deploy job (docker info exited ${info.code}): ${output(info)}\n[provision] Containers: wrangler deploy builds and pushes the render image, which needs a Docker daemon.`
    );
  }
  const containers = await run(CONTAINERS_LIST);
  if (containers.code !== 0) {
    throw new Error(
      `[provision] Containers: the token cannot list Containers (wrangler containers list exited ${containers.code}): ${output(containers)}\n[provision] Containers: the account needs Containers (Workers Paid) and the ${env} CLOUDFLARE_API_TOKEN needs Containers access (Account › Containers: Edit) before SMOG_RENDER_PIPELINE=1 (PROGRESS owner actions).`
    );
  }
  log.log(
    `[provision] ${env}: Workflows and Containers are reachable, and Docker runs.`
  );
}

function dryRun({ log, pipeline, plan }: EnsureOptions): EnsureResult {
  if (pipeline) {
    log.log(shown(WORKFLOWS_LIST));
    log.log(shownDocker(DOCKER_INFO));
    log.log(shown(CONTAINERS_LIST));
  }
  for (const name of plan.queues) {
    log.log(shown(["queues", "info", name]));
    log.log(`  if missing: ${shown(["queues", "create", name])}`);
  }
  if (plan.buckets.length > 0) {
    log.log(shown(["r2", "bucket", "list"]));
  }
  for (const bucket of plan.buckets) {
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
  /** `null` while the bucket does not exist (nothing to look up). */
  cors: CorsState | null;
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
  plan: ResourcePlan
): Promise<Lookup> {
  const missingQueues: string[] = [];
  for (const name of plan.queues) {
    // biome-ignore lint/performance/noAwaitInLoops: one wrangler call at a time.
    if (!(await queueExists(run, name))) {
      missingQueues.push(name);
    }
  }
  const existing =
    plan.buckets.length > 0 ? await listBuckets(run) : new Set<string>();
  const buckets: BucketState[] = [];
  for (const bucket of plan.buckets) {
    const exists = existing.has(bucket.name);
    // biome-ignore lint/performance/noAwaitInLoops: one wrangler call at a time.
    const cors = exists ? await bucketCors(run, bucket) : null;
    buckets.push({ bucket, cors, exists });
  }
  return { buckets, missingQueues };
}

function mismatches(lookup: Lookup): BucketState[] {
  return lookup.buckets.filter((entry) => entry.cors === "mismatch");
}

/**
 * A CORS that does not allow the PUT from `SITE_URL` (a changed site
 * origin): never overwritten, reported with the command that fixes it.
 */
function reportMismatches(lookup: Lookup, log: Logger): string[] {
  return mismatches(lookup).map(({ bucket }) => {
    log.warn(
      `[provision] ${bucket.name} has a CORS configuration that does not allow PUT with content-type from ${bucket.corsOrigin}. It is never overwritten here; after checking it, replace it with:`
    );
    log.warn(`  ${corsFix(bucket)}`);
    return `cors-mismatch:${bucket.name}`;
  });
}

function missingOf({ buckets, missingQueues }: Lookup): string[] {
  return [
    ...missingQueues,
    ...buckets
      .filter((entry) => !entry.exists)
      .map((entry) => entry.bucket.name),
    ...buckets
      .filter((entry) => entry.cors === null || entry.cors === "none")
      .map((entry) => `cors:${entry.bucket.name}`),
  ];
}

/** `--check`: what is missing, with the commands that would create it. */
function report(env: DeployEnv, lookup: Lookup, log: Logger): EnsureResult {
  const missing = missingOf(lookup);
  if (missing.length > 0) {
    log.warn(
      `[provision] ${env} is missing ${missing.join(", ")}. Create them with:`
    );
    for (const name of lookup.missingQueues) {
      log.warn(`  ${shown(["queues", "create", name])}`);
    }
    for (const { bucket, cors, exists } of lookup.buckets) {
      if (!exists) {
        log.warn(`  ${shown(bucketCreateArgs(bucket.name))}`);
      }
      if (cors === null || cors === "none") {
        log.warn(`  ${corsFix(bucket)}`);
      }
    }
    log.warn(
      "  or set the repository variable SMOG_PROVISION_PRODUCTION=1 so the deploy creates them."
    );
  }
  const wrong = reportMismatches(lookup, log);
  if (missing.length === 0 && wrong.length === 0) {
    log.log(`[provision] ${env}: every queue and bucket exists.`);
  }
  return {
    created: [],
    missing: [...missing, ...wrong],
    ok: missing.length === 0 && wrong.length === 0,
  };
}

/** Creates a bucket; one that `r2 bucket list` did not show but exists (10004) is kept. */
async function createBucket(
  run: WranglerRunner,
  bucket: { corsOrigin: string; name: string },
  log: Logger
): Promise<{ cors: CorsState; created: boolean }> {
  const result = await run(bucketCreateArgs(bucket.name));
  if (result.code === 0) {
    log.log(`[provision] Created the bucket ${bucket.name}`);
    return { cors: "none", created: true };
  }
  if (BUCKET_TAKEN.test(output(result))) {
    log.log(
      `[provision] ${bucket.name} already exists (not in the bucket list); it is left as it is`
    );
    return { cors: await bucketCors(run, bucket), created: false };
  }
  throw withHint(
    `[provision] Failed to run wrangler ${bucketCreateArgs(bucket.name).join(" ")} (exit ${result.code}): ${output(result)}`,
    result
  );
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
    log.log(`[provision] Created the queue ${name}`);
    created.push(name);
  }
  for (const entry of lookup.buckets) {
    const { bucket } = entry;
    if (!entry.exists) {
      // biome-ignore lint/performance/noAwaitInLoops: one wrangler call at a time; the first failure stops the run.
      const outcome = await createBucket(run, bucket, log);
      entry.cors = outcome.cors;
      if (outcome.created) {
        created.push(bucket.name);
      }
    }
    if (entry.cors === "none") {
      await setCors(run, bucket);
      log.log(
        `[provision] Set the CORS of ${bucket.name} (PUT from ${bucket.corsOrigin})`
      );
      created.push(`cors:${bucket.name}`);
    }
  }
  const wrong = reportMismatches(lookup, log);
  if (created.length === 0 && wrong.length === 0) {
    log.log(
      `[provision] ${env}: every queue and bucket exists; nothing changed.`
    );
  }
  return { created, missing: wrong, ok: wrong.length === 0 };
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
  if (
    env === "production" &&
    mode === "create" &&
    plan.buckets.some(
      (bucket) => bucket.corsOrigin === PRODUCTION_SITE_URL_PLACEHOLDER
    )
  ) {
    throw new Error(
      `[provision] production SITE_URL is still the placeholder ${PRODUCTION_SITE_URL_PLACEHOLDER}: set the launch origin in wrangler.jsonc before creating the production bucket (its CORS is set from it)`
    );
  }
  if (options.pipeline) {
    await probeRenderPipeline(env, run, options.docker ?? bunDocker, log);
  }
  const lookup = await lookUp(run, plan);
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
      `[provision] --env must be staging or production (dev uses local resources), got ${JSON.stringify(env ?? null)}`
    );
  }
  const modes = (["create", "check", "dry-run"] as const).filter((flag) =>
    argv.includes(`--${flag}`)
  );
  const [mode] = modes;
  if (modes.length !== 1 || !mode) {
    throw new Error(
      "[provision] pass exactly one mode: --create, --check or --dry-run"
    );
  }
  if (
    env === "production" &&
    mode === "create" &&
    environment.SMOG_PROVISION_PRODUCTION !== "1"
  ) {
    throw new Error(
      "[provision] --create for production needs SMOG_PROVISION_PRODUCTION=1 (otherwise use --check)"
    );
  }
  return { env: env as DeployEnv, mode };
}

const SITE_DIR = join(import.meta.dir, "..", "apps", "site");

async function spawn(command: string[]): Promise<WranglerResult> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(command, {
      cwd: SITE_DIR,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stderr: "pipe",
      stdout: "pipe",
    });
  } catch (error) {
    // Not installed: the shell's "command not found".
    return { code: 127, stderr: String(error), stdout: "" };
  }
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr as ReadableStream).text(),
    proc.exited,
  ]);
  return { code, stderr, stdout };
}

const bunxWrangler: WranglerRunner = (args) =>
  spawn(["bunx", "wrangler", ...args]);

const bunDocker: CommandRunner = (args) => spawn(["docker", ...args]);

if (import.meta.main) {
  try {
    const { env, mode } = parseEnsureArgs(process.argv.slice(2), process.env);
    const source = await Bun.file(join(SITE_DIR, "wrangler.jsonc")).text();
    const refusal = renderGateRefusal(
      source,
      env,
      process.env.SMOG_RENDER_PIPELINE
    );
    if (refusal) {
      throw new Error(refusal);
    }
    const result = await ensureResources({
      docker: bunDocker,
      env,
      log: { log: console.log, warn: console.warn },
      mode,
      pipeline: renderPipelineEnabled(
        source,
        env,
        process.env.SMOG_RENDER_PIPELINE
      ),
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
