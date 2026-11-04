import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `bun scripts/preview-env.ts <prepare|seed|secrets|down|sweep> …`: one
 * isolated environment per pull request (`.github/workflows/preview.yml`).
 *
 * A PR environment is a Worker of its own, `smog-site-pr-<n>`, at
 * `https://smog-site-pr-<n>.<subdomain>.workers.dev`, with its own D1
 * (`smog-pr-<n>`), KV namespace (`smog-pr-<n>`), queues and DLQs
 * (`smog-pr-<n>-…`, consumed by that Worker) and R2 bucket
 * (`smog-pr-<n>-media`). It runs the PR's code exactly like staging
 * (`ENVIRONMENT` is `staging`: the dev pages, Turnstile's always-pass
 * keys, the `send_email` binding and the four crons), so nothing in the
 * build, the deploy guard or the Worker knows about previews.
 *
 * - `prepare --pr <n>` finds or creates the D1 and the KV namespace, then
 *   rewrites `env.staging` of `apps/site/wrangler.jsonc` **in this
 *   checkout** into the PR's env and drops `env.production`. Every later
 *   step of the workflow is the ordinary staging command
 *   (`ensure-cloudflare-resources.ts --env staging --create`, `wrangler d1
 *   migrations apply DB --env staging --remote`, `admin:grant --env
 *   staging`, `CLOUDFLARE_ENV=staging bun -F @smog/site deploy`) and so
 *   reaches the PR's resources. Never commit the rewritten file.
 * - `seed --pr <n>` loads the dev seed **without** its admin (the dev
 *   password is public) into a D1 that has no gesture yet.
 * - `secrets --pr <n>` sets `BETTER_AUTH_SECRET` (random, once),
 *   Turnstile's always-pass test secret, and the optional
 *   `MOLLIE_API_KEY` (a `test_` key), `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET`
 *   when the workflow passes them.
 * - `down --pr <n>` deletes the Worker, the queues, the D1, the KV
 *   namespace and the bucket (emptied first). `sweep --open "<n> <n> …"`
 *   does the same for every PR environment whose number is not open (the
 *   daily safety net for a missed close).
 *
 * `seed` and `secrets` refuse to run unless the checkout's
 * `wrangler.jsonc` has been prepared for that PR, so they can never write
 * to the real staging. The Cloudflare REST API (`CLOUDFLARE_API_TOKEN`,
 * `CLOUDFLARE_ACCOUNT_ID`) lists, creates and deletes; wrangler runs from
 * `apps/site` for the rest. The token needs D1: Edit, Workers KV Storage:
 * Edit, Workers R2 Storage: Edit, Queues: Edit and Workers Scripts: Edit.
 */

const ROOT = join(import.meta.dir, "..");
const SITE_DIR = join(ROOT, "apps", "site");
const WRANGLER_FILE = join(SITE_DIR, "wrangler.jsonc");

/** Cloudflare's always-pass Turnstile test secret (the staging site key's pair). */
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

/** Secrets a workflow may pass through (`PREVIEW_<NAME>` GitHub secrets). */
export const FORWARDED_SECRETS = [
  "MOLLIE_API_KEY",
  "MUX_TOKEN_ID",
  "MUX_TOKEN_SECRET",
] as const;

const STAGING_PREFIX = "smog-staging-";
const PREVIEW_NAME = /^smog-(?:site-)?pr-(\d+)(?:-|$)/;
const PR_NUMBER = /^[1-9]\d{0,6}$/;
const LIST_SEPARATOR = /[\s,]+/;
const STAGING_DB = "smog-staging";

export interface PreviewNames {
  bucket: string;
  database: string;
  kv: string;
  /** Every queue name starts with it. */
  queuePrefix: string;
  worker: string;
}

export function previewNames(pr: number): PreviewNames {
  return {
    bucket: `smog-pr-${pr}-media`,
    database: `smog-pr-${pr}`,
    kv: `smog-pr-${pr}`,
    queuePrefix: `smog-pr-${pr}-`,
    worker: `smog-site-pr-${pr}`,
  };
}

/** The PR number of a preview resource name, or `null` for anything else. */
export function previewNumber(name: string): number | null {
  const match = PREVIEW_NAME.exec(name);
  return match?.[1] ? Number(match[1]) : null;
}

export function parsePr(value: string | undefined): number {
  if (!(value && PR_NUMBER.test(value))) {
    throw new Error(
      `[preview] --pr must be a pull request number, got ${JSON.stringify(value ?? null)}`
    );
  }
  return Number(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every string in `value`, with `smog-staging-` replaced by `prefix`. */
function renamed(value: unknown, prefix: string): unknown {
  if (typeof value === "string") {
    return value.replaceAll(STAGING_PREFIX, prefix);
  }
  if (Array.isArray(value)) {
    return value.map((item) => renamed(item, prefix));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renamed(item, prefix)])
    );
  }
  return value;
}

/** `<subdomain>` of the staging origin `https://<script>.<subdomain>.workers.dev`. */
export function workersSubdomain(siteUrl: string): string {
  const labels = new URL(siteUrl).hostname.split(".");
  if (labels.length !== 4 || labels.slice(2).join(".") !== "workers.dev") {
    throw new Error(
      `[preview] env.staging SITE_URL ${siteUrl} is not a workers.dev origin; the PR origin is derived from its subdomain`
    );
  }
  return labels[1] as string;
}

export interface PreviewIds {
  databaseId: string;
  kvId: string;
}

/**
 * `wrangler.jsonc` with `env.staging` turned into the PR's env and
 * `env.production` removed (JSON, the comments are gone). Throws when a
 * staging resource would survive the rewrite.
 */
export function previewConfig(
  source: string,
  pr: number,
  ids: PreviewIds
): { config: Record<string, unknown>; siteUrl: string } {
  const parsed: unknown = Bun.JSONC.parse(source);
  if (!(isRecord(parsed) && isRecord(parsed.env))) {
    throw new Error("[preview] wrangler.jsonc has no env block");
  }
  const { staging } = parsed.env;
  if (!(isRecord(staging) && isRecord(staging.vars))) {
    throw new Error("[preview] wrangler.jsonc has no env.staging.vars");
  }
  const names = previewNames(pr);
  const siteUrl = `https://${names.worker}.${workersSubdomain(String(staging.vars.SITE_URL))}.workers.dev`;
  const env = renamed(staging, names.queuePrefix) as Record<string, unknown>;
  env.name = names.worker;
  env.workers_dev = true;
  env.preview_urls = false;
  env.vars = {
    ...(env.vars as Record<string, unknown>),
    // Previews report nothing to Rustrak: the staging project stays clean.
    SENTRY_DSN: "",
    SITE_URL: siteUrl,
  };
  const kv = Array.isArray(env.kv_namespaces) ? env.kv_namespaces : [];
  const d1 = Array.isArray(env.d1_databases) ? env.d1_databases : [];
  if (kv.length !== 1 || d1.length !== 1) {
    throw new Error(
      "[preview] env.staging must have exactly one KV namespace and one D1 database"
    );
  }
  env.kv_namespaces = [{ ...kv[0], id: ids.kvId }];
  env.d1_databases = [
    { ...d1[0], database_id: ids.databaseId, database_name: names.database },
  ];
  const text = JSON.stringify(env);
  const stagingIds = [
    ...(staging.kv_namespaces as { id: string }[]).map((entry) => entry.id),
    ...(staging.d1_databases as { database_id: string }[]).map(
      (entry) => entry.database_id
    ),
  ];
  if (
    text.includes(STAGING_PREFIX) ||
    text.includes(`"${STAGING_DB}"`) ||
    stagingIds.some((id) => text.includes(id))
  ) {
    throw new Error(
      "[preview] the rewritten env still names a staging resource"
    );
  }
  const { production: _production, ...envs } = parsed.env;
  return {
    config: { ...parsed, env: { ...envs, staging: env } },
    siteUrl,
  };
}

/**
 * Throws unless `source` (the checkout's `wrangler.jsonc`) was prepared for
 * `pr`: `seed` and `secrets` must never reach the real staging.
 */
export function assertPrepared(source: string, pr: number): PreviewIds {
  const parsed: unknown = Bun.JSONC.parse(source);
  const env =
    isRecord(parsed) && isRecord(parsed.env) ? parsed.env.staging : null;
  const names = previewNames(pr);
  const d1 =
    isRecord(env) && Array.isArray(env.d1_databases)
      ? env.d1_databases[0]
      : null;
  const kv =
    isRecord(env) && Array.isArray(env.kv_namespaces)
      ? env.kv_namespaces[0]
      : null;
  if (
    !(
      isRecord(env) &&
      env.name === names.worker &&
      isRecord(d1) &&
      isRecord(kv)
    ) ||
    d1.database_name !== names.database
  ) {
    throw new Error(
      `[preview] apps/site/wrangler.jsonc is not prepared for PR ${pr}: run \`bun scripts/preview-env.ts prepare --pr ${pr}\` first`
    );
  }
  return { databaseId: String(d1.database_id), kvId: String(kv.id) };
}

/** The secrets to write: what is missing or must follow the workflow. */
export function secretsToSet(
  existing: ReadonlySet<string>,
  environment: Record<string, string | undefined>,
  random: () => string
): Record<string, string> {
  const secrets: Record<string, string> = {
    TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRET,
  };
  if (!existing.has("BETTER_AUTH_SECRET")) {
    secrets.BETTER_AUTH_SECRET = random();
  }
  for (const name of FORWARDED_SECRETS) {
    const value = environment[name];
    if (value) {
      secrets[name] = value;
    }
  }
  if (secrets.MOLLIE_API_KEY && !secrets.MOLLIE_API_KEY.startsWith("test_")) {
    throw new Error("[preview] MOLLIE_API_KEY must be a Mollie test_ key");
  }
  return secrets;
}

// The Cloudflare API ---------------------------------------------------------

export interface ApiResponse {
  errors: { code: number; message: string }[];
  result: unknown;
  result_info?: Record<string, unknown>;
  status: number;
  success: boolean;
}

/** One Cloudflare API call, relative to `/accounts/<id>` (tests pass a fake). */
export type Api = (
  method: "DELETE" | "GET" | "POST",
  path: string,
  body?: unknown
) => Promise<ApiResponse>;

export interface CommandResult {
  code: number;
  stderr: string;
  stdout: string;
}

/** Runs a command from `apps/site` (tests pass a fake). */
export type Runner = (command: string[]) => Promise<CommandResult>;

interface Logger {
  log: (line: string) => void;
  warn: (line: string) => void;
}

function describe(response: ApiResponse): string {
  const errors = response.errors
    .map((error) => `${error.code} ${error.message}`)
    .join("; ");
  return `HTTP ${response.status}${errors ? `: ${errors}` : ""}`;
}

async function call(
  api: Api,
  what: string,
  method: "DELETE" | "GET" | "POST",
  path: string,
  body?: unknown
): Promise<unknown> {
  const response = await api(method, path, body);
  if (!response.success) {
    throw new Error(`[preview] Failed to ${what} (${describe(response)})`);
  }
  return response.result;
}

/** Every page of a paged list (`page`, `per_page`). */
async function listAll(
  api: Api,
  what: string,
  path: string
): Promise<unknown[]> {
  const items: unknown[] = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let page = 1; page <= 100; page += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: pages follow each other.
    const result = await call(
      api,
      what,
      "GET",
      `${path}${separator}page=${page}&per_page=100`
    );
    const batch = Array.isArray(result) ? result : [];
    items.push(...batch);
    if (batch.length < 100) {
      break;
    }
  }
  return items;
}

function field(item: unknown, key: string): string {
  return isRecord(item) && typeof item[key] === "string" ? item[key] : "";
}

async function findDatabase(api: Api, name: string): Promise<string | null> {
  const found = await listAll(
    api,
    "list the D1 databases",
    `/d1/database?name=${encodeURIComponent(name)}`
  );
  const match = found.find((item) => field(item, "name") === name);
  return match ? field(match, "uuid") : null;
}

async function findNamespace(api: Api, title: string): Promise<string | null> {
  const found = await listAll(
    api,
    "list the KV namespaces",
    "/storage/kv/namespaces"
  );
  const match = found.find((item) => field(item, "title") === title);
  return match ? field(match, "id") : null;
}

/** Finds or creates the PR's D1 database and KV namespace. */
export async function ensureStores(
  api: Api,
  pr: number,
  log: Logger
): Promise<PreviewIds> {
  const names = previewNames(pr);
  let databaseId = await findDatabase(api, names.database);
  if (databaseId) {
    log.log(`[preview] D1 ${names.database} exists (${databaseId})`);
  } else {
    const created = await call(
      api,
      `create the D1 ${names.database}`,
      "POST",
      "/d1/database",
      {
        name: names.database,
      }
    );
    databaseId = field(created, "uuid");
    log.log(`[preview] Created D1 ${names.database} (${databaseId})`);
  }
  let kvId = await findNamespace(api, names.kv);
  if (kvId) {
    log.log(`[preview] KV ${names.kv} exists (${kvId})`);
  } else {
    const created = await call(
      api,
      `create the KV namespace ${names.kv}`,
      "POST",
      "/storage/kv/namespaces",
      {
        title: names.kv,
      }
    );
    kvId = field(created, "id");
    log.log(`[preview] Created KV ${names.kv} (${kvId})`);
  }
  if (!(databaseId && kvId)) {
    throw new Error("[preview] The API answered without an id");
  }
  return { databaseId, kvId };
}

/** Names of the secrets the Worker has (none while it does not exist). */
export async function existingSecrets(
  api: Api,
  worker: string
): Promise<Set<string>> {
  const response = await api("GET", `/workers/scripts/${worker}/secrets`);
  if (!response.success) {
    if (response.status === 404) {
      return new Set();
    }
    throw new Error(
      `[preview] Failed to list the secrets of ${worker} (${describe(response)})`
    );
  }
  const result = Array.isArray(response.result) ? response.result : [];
  return new Set(result.map((item) => field(item, "name")).filter(Boolean));
}

/** How many gestures the PR's D1 has (0: not seeded yet). */
export async function gestureCount(
  api: Api,
  databaseId: string
): Promise<number> {
  const result = await call(
    api,
    "count the gestures",
    "POST",
    `/d1/database/${databaseId}/query`,
    {
      sql: "SELECT COUNT(*) AS n FROM gesture",
    }
  );
  const first = Array.isArray(result) ? result[0] : null;
  const rows =
    isRecord(first) && Array.isArray(first.results) ? first.results : [];
  const n = isRecord(rows[0]) ? rows[0].n : 0;
  return typeof n === "number" ? n : 0;
}

// Teardown ------------------------------------------------------------------

/** Every PR environment's resources in the account, by PR number. */
export interface PreviewResources {
  buckets: string[];
  databases: { id: string; name: string }[];
  namespaces: { id: string; title: string }[];
  queues: { id: string; name: string }[];
  workers: string[];
}

function emptyResources(): PreviewResources {
  return {
    buckets: [],
    databases: [],
    namespaces: [],
    queues: [],
    workers: [],
  };
}

export async function inventory(
  api: Api
): Promise<Map<number, PreviewResources>> {
  const byPr = new Map<number, PreviewResources>();
  const at = (name: string): PreviewResources | null => {
    const pr = previewNumber(name);
    if (pr === null) {
      return null;
    }
    const entry = byPr.get(pr) ?? emptyResources();
    byPr.set(pr, entry);
    return entry;
  };
  const scripts = await call(
    api,
    "list the Workers",
    "GET",
    "/workers/scripts"
  );
  for (const script of Array.isArray(scripts) ? scripts : []) {
    const name = field(script, "id");
    if (name.startsWith("smog-site-pr-")) {
      at(name)?.workers.push(name);
    }
  }
  for (const db of await listAll(
    api,
    "list the D1 databases",
    "/d1/database?name=smog-pr-"
  )) {
    const name = field(db, "name");
    if (name.startsWith("smog-pr-")) {
      at(name)?.databases.push({ id: field(db, "uuid"), name });
    }
  }
  for (const ns of await listAll(
    api,
    "list the KV namespaces",
    "/storage/kv/namespaces"
  )) {
    const title = field(ns, "title");
    if (title.startsWith("smog-pr-")) {
      at(title)?.namespaces.push({ id: field(ns, "id"), title });
    }
  }
  for (const queue of await listAll(api, "list the queues", "/queues")) {
    const name = field(queue, "queue_name");
    if (name.startsWith("smog-pr-")) {
      at(name)?.queues.push({ id: field(queue, "queue_id"), name });
    }
  }
  const buckets = await call(
    api,
    "list the R2 buckets",
    "GET",
    "/r2/buckets?name_contains=smog-pr-&per_page=1000"
  );
  const list =
    isRecord(buckets) && Array.isArray(buckets.buckets) ? buckets.buckets : [];
  for (const bucket of list) {
    const name = field(bucket, "name");
    if (name.startsWith("smog-pr-")) {
      at(name)?.buckets.push(name);
    }
  }
  return byPr;
}

function objectPath(bucket: string, key: string): string {
  return `/r2/buckets/${bucket}/objects/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Deletes every object of the bucket. `false` when the API cannot list
 * them: the caller then sets a 1-day expiry and the sweep deletes the
 * bucket later.
 */
async function emptyBucket(api: Api, bucket: string): Promise<boolean> {
  let cursor = "";
  for (let round = 0; round < 1000; round += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time.
    const response = await api(
      "GET",
      `/r2/buckets/${bucket}/objects?per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
    );
    if (!response.success) {
      return false;
    }
    const objects = Array.isArray(response.result) ? response.result : [];
    for (const object of objects) {
      // biome-ignore lint/performance/noAwaitInLoops: a preview bucket holds a handful of objects.
      await call(
        api,
        `delete ${bucket}/${field(object, "key")}`,
        "DELETE",
        objectPath(bucket, field(object, "key"))
      );
    }
    const next = response.result_info?.cursor;
    if (
      !(response.result_info?.is_truncated && typeof next === "string" && next)
    ) {
      return true;
    }
    cursor = next;
  }
  return false;
}

/**
 * Deletes one PR environment, in dependency order (the Worker first, so no
 * queue has a consumer left). Every step runs; failures are collected.
 */
export async function teardown(
  { api, log, run }: { api: Api; log: Logger; run: Runner },
  pr: number,
  resources: PreviewResources
): Promise<string[]> {
  const failures: string[] = [];
  const attempt = async (what: string, action: () => Promise<unknown>) => {
    try {
      await action();
      log.log(`[preview] PR ${pr}: deleted ${what}`);
    } catch (error) {
      failures.push(
        `${what}: ${error instanceof Error ? error.message : error}`
      );
    }
  };
  for (const worker of resources.workers) {
    // biome-ignore lint/performance/noAwaitInLoops: in order, the Worker first.
    await attempt(`the Worker ${worker}`, () =>
      call(
        api,
        `delete the Worker ${worker}`,
        "DELETE",
        `/workers/scripts/${worker}?force=true`
      )
    );
  }
  for (const queue of resources.queues) {
    // biome-ignore lint/performance/noAwaitInLoops: one call at a time.
    await attempt(`the queue ${queue.name}`, () =>
      call(
        api,
        `delete the queue ${queue.name}`,
        "DELETE",
        `/queues/${queue.id}`
      )
    );
  }
  for (const db of resources.databases) {
    // biome-ignore lint/performance/noAwaitInLoops: one call at a time.
    await attempt(`D1 ${db.name}`, () =>
      call(api, `delete D1 ${db.name}`, "DELETE", `/d1/database/${db.id}`)
    );
  }
  for (const ns of resources.namespaces) {
    // biome-ignore lint/performance/noAwaitInLoops: one call at a time.
    await attempt(`KV ${ns.title}`, () =>
      call(
        api,
        `delete KV ${ns.title}`,
        "DELETE",
        `/storage/kv/namespaces/${ns.id}`
      )
    );
  }
  for (const bucket of resources.buckets) {
    // biome-ignore lint/performance/noAwaitInLoops: one bucket at a time.
    if (!(await emptyBucket(api, bucket))) {
      const expire = await run([
        "bunx",
        "wrangler",
        "r2",
        "bucket",
        "lifecycle",
        "add",
        bucket,
        "smog-preview-expire",
        "",
        "--expire-days",
        "1",
        "--force",
      ]);
      log.warn(
        expire.code === 0
          ? `[preview] PR ${pr}: could not list ${bucket}; its objects now expire after a day and the daily sweep deletes it`
          : `[preview] PR ${pr}: could not list or expire ${bucket}; empty it in the dashboard`
      );
    }
    await attempt(`the bucket ${bucket}`, () =>
      call(
        api,
        `delete the bucket ${bucket}`,
        "DELETE",
        `/r2/buckets/${bucket}`
      )
    );
  }
  return failures;
}

/** The PR numbers to tear down: every environment whose PR is not open. */
export function sweepTargets(
  found: ReadonlyMap<number, PreviewResources>,
  open: ReadonlySet<number>
): number[] {
  return [...found.keys()].filter((pr) => !open.has(pr)).sort((a, b) => a - b);
}

export function parseOpen(value: string | undefined): Set<number> {
  if (value === undefined) {
    throw new Error(
      '[preview] sweep needs --open "<n> <n> …" (the open PR numbers, may be empty)'
    );
  }
  return new Set(
    value
      .split(LIST_SEPARATOR)
      .filter(Boolean)
      .map((item) => parsePr(item))
  );
}

// The CLI -------------------------------------------------------------------

function cloudflareApi(environment: Record<string, string | undefined>): Api {
  const token = environment.CLOUDFLARE_API_TOKEN;
  const account = environment.CLOUDFLARE_ACCOUNT_ID;
  if (!(token && account)) {
    throw new Error(
      "[preview] CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required"
    );
  }
  return async (method, path, body) => {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}${path}`,
      {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        method,
      }
    );
    const json: unknown = await response.json().catch(() => ({}));
    const data = isRecord(json) ? json : {};
    return {
      errors: Array.isArray(data.errors)
        ? (data.errors as ApiResponse["errors"])
        : [],
      result: data.result,
      result_info: isRecord(data.result_info) ? data.result_info : undefined,
      status: response.status,
      success: response.ok && data.success !== false,
    };
  };
}

const spawnRunner: Runner = async (command) => {
  const proc = Bun.spawn(command, {
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

async function mustRun(
  run: Runner,
  command: string[],
  what: string
): Promise<void> {
  const result = await run(command);
  if (result.code !== 0) {
    throw new Error(
      `[preview] Failed to ${what} (exit ${result.code}): ${result.stdout}\n${result.stderr}`
    );
  }
}

function option(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
}

function githubOutput(values: Record<string, string>): void {
  const file = process.env.GITHUB_OUTPUT;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  for (const line of lines) {
    console.log(line);
  }
  if (file) {
    writeFileSync(file, `${lines.join("\n")}\n`, { flag: "a" });
  }
}

/** A temporary file that is always removed. */
async function withTempFile(
  name: string,
  content: string,
  use: (file: string) => Promise<void>
): Promise<void> {
  const file = join(tmpdir(), `smog-preview-${crypto.randomUUID()}-${name}`);
  writeFileSync(file, content, { mode: 0o600 });
  try {
    await use(file);
  } finally {
    rmSync(file, { force: true });
  }
}

const consoleLog: Logger = {
  log: console.log,
  warn: (line) => console.warn(`::warning::${line}`),
};

async function main(argv: readonly string[]): Promise<void> {
  const [command] = argv;
  const api = cloudflareApi(process.env);
  if (command === "sweep") {
    const open = parseOpen(option(argv, "--open"));
    const found = await inventory(api);
    const targets = sweepTargets(found, open);
    consoleLog.log(
      `[preview] ${found.size} PR environment(s); to delete: ${targets.join(", ") || "none"}`
    );
    const failures: string[] = [];
    for (const pr of targets) {
      // biome-ignore lint/performance/noAwaitInLoops: one environment at a time.
      const failed = await teardown(
        { api, log: consoleLog, run: spawnRunner },
        pr,
        found.get(pr) ?? emptyResources()
      );
      failures.push(...failed);
    }
    if (failures.length > 0) {
      throw new Error(
        `[preview] Some deletions failed:\n${failures.join("\n")}`
      );
    }
    return;
  }
  const pr = parsePr(option(argv, "--pr"));
  const names = previewNames(pr);
  if (command === "prepare") {
    const ids = await ensureStores(api, pr, consoleLog);
    const { config, siteUrl } = previewConfig(
      readFileSync(WRANGLER_FILE, "utf8"),
      pr,
      ids
    );
    writeFileSync(WRANGLER_FILE, `${JSON.stringify(config, null, 2)}\n`);
    assertPrepared(readFileSync(WRANGLER_FILE, "utf8"), pr);
    consoleLog.log(
      `[preview] apps/site/wrangler.jsonc env.staging now targets ${names.worker}`
    );
    githubOutput({ url: siteUrl, worker: names.worker });
    return;
  }
  if (command === "seed") {
    const { databaseId } = assertPrepared(
      readFileSync(WRANGLER_FILE, "utf8"),
      pr
    );
    if ((await gestureCount(api, databaseId)) > 0) {
      consoleLog.log(
        `[preview] D1 ${names.database} already has gestures; not seeded again`
      );
      return;
    }
    await withTempFile("seed.sql", "", async (file) => {
      await mustRun(
        spawnRunner,
        [
          "bun",
          "../../packages/db/scripts/seed.ts",
          "--without-admin",
          "--out",
          file,
        ],
        "build the seed"
      );
      await mustRun(
        spawnRunner,
        [
          "bunx",
          "wrangler",
          "d1",
          "execute",
          "DB",
          "--env",
          "staging",
          "--remote",
          "--yes",
          "--file",
          file,
        ],
        "apply the seed"
      );
    });
    await mustRun(
      spawnRunner,
      [
        "bunx",
        "wrangler",
        "kv",
        "key",
        "put",
        "catalog:version",
        `seed-${Date.now()}`,
        "--binding",
        "KV",
        "--env",
        "staging",
        "--remote",
      ],
      "bump catalog:version"
    );
    consoleLog.log(
      `[preview] Seeded D1 ${names.database} (no admin: grant one with admin:grant)`
    );
    return;
  }
  if (command === "secrets") {
    assertPrepared(readFileSync(WRANGLER_FILE, "utf8"), pr);
    const secrets = secretsToSet(
      await existingSecrets(api, names.worker),
      process.env,
      () =>
        Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString(
          "base64url"
        )
    );
    await withTempFile("secrets.json", JSON.stringify(secrets), (file) =>
      mustRun(
        spawnRunner,
        ["bunx", "wrangler", "secret", "bulk", file, "--env", "staging"],
        "set the secrets"
      )
    );
    consoleLog.log(
      `[preview] Set ${Object.keys(secrets).sort().join(", ")} on ${names.worker}`
    );
    return;
  }
  if (command === "down") {
    const found = (await inventory(api)).get(pr) ?? emptyResources();
    const failures = await teardown(
      { api, log: consoleLog, run: spawnRunner },
      pr,
      found
    );
    if (failures.length > 0) {
      throw new Error(
        `[preview] Some deletions failed (the daily sweep retries):\n${failures.join("\n")}`
      );
    }
    return;
  }
  throw new Error(
    'Usage: bun scripts/preview-env.ts prepare|seed|secrets|down --pr <n>, or sweep --open "<n> …"'
  );
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
