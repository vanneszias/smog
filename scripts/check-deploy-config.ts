import { join } from "node:path";
import {
  PROVIDER_SECRET_GROUPS,
  RECOMMENDED_WORKER_CONFIG,
  RENDER_MODES,
  type RenderMode,
  requiredWorkerConfig,
} from "@smog/config/env/worker";
import {
  bunxWrangler,
  type CommandRunner,
  type DeployEnv,
  isPlaceholderOrigin,
  type WranglerResult,
} from "./ensure-cloudflare-resources";

/**
 * `bun scripts/check-deploy-config.ts --env <staging|production>
 *   [--offline] [--warn-only]`
 *
 * The before-deploy facts the Worker cannot check itself (phase 8 ruling
 * 1). `deploy.yml` runs it right after `bun install`, before anything is
 * created, migrated or built:
 *
 * - from `apps/site/wrangler.jsonc` `env.<env>`: the render mode (unset is
 *   `fake`; `local` is dev only), every var `requiredWorkerConfig(env,
 *   mode)` needs (non-empty), `SITE_URL` (a bare `https:` origin that is
 *   not a placeholder: a workers.dev host is
 *   `<script>.<subdomain>.workers.dev`), and the exact KV and D1
 *   placeholder ids;
 * - online (the default), `wrangler secret list --env <env>`: every
 *   required secret, each sign-in provider whole or absent
 *   (`PROVIDER_SECRET_GROUPS`), and the R2 tokens with their vars. An
 *   absent provider or OpenPanel pair is listed as recommended, never an
 *   error. Secret values cannot be read, so their value rules (a `live_`
 *   Mollie key) stay in `workerEnvSchema` at runtime.
 *
 * `--offline` skips the secrets (`release:check:core` runs `--env staging
 * --offline`). `--warn-only` (staging only, until the owner sets the
 * staging GitHub environment variable `SMOG_REQUIRE_SECRETS=1`) turns
 * every problem, whatever its cause, into a `::warning::` and exits 0;
 * production refuses it. Wrangler runs from `apps/site` with the deploy
 * job's token, which needs Workers Scripts: Read (Edit includes it).
 */

const SITE_DIR = join(import.meta.dir, "..", "apps", "site");
const TAG = "[deploy-config]";

/** `wrangler.jsonc`'s D1 `database_id` until the owner creates the database. */
export const D1_PLACEHOLDER_ID = "00000000-0000-4000-8000-000000000000";
/** `wrangler.jsonc`'s KV `id` until the owner creates the namespace. */
export const KV_PLACEHOLDER_ID = "0".repeat(32);

/** Hosts that are never a deployed site (RFC 2606 / 6761 names). */
const RESERVED_HOST =
  /(^|\.)(localhost|test|invalid|example|local)$|(^|\.)example\.(com|net|org)$/;
const TRAILING_DOT = /\.$/;

/** The R2 S3 identity of the presigned logo PUT (phase 6 ruling 10). */
const R2_TOKENS = ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] as const;
const R2_VARS = ["R2_ACCOUNT_ID", "MEDIA_BUCKET"] as const;

export interface DeployConfigInput {
  env: DeployEnv;
  /** The names `wrangler secret list` gave, or null when not checked. */
  secrets: readonly string[] | null;
  /** `apps/site/wrangler.jsonc`, as text. */
  wrangler: string;
}

export interface DeployConfigResult {
  errors: string[];
  /** Optional groups the env has none of ("not configured"). */
  recommended: string[];
  warnings: string[];
}

interface Logger {
  error: (line: string) => void;
  log: (line: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function filled(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function renderModeOf(
  env: DeployEnv,
  vars: Record<string, unknown>,
  errors: string[]
): RenderMode {
  const mode = vars.RENDER_MODE ?? "fake";
  if (!RENDER_MODES.includes(mode as RenderMode)) {
    errors.push(
      `env.${env}.vars.RENDER_MODE is ${JSON.stringify(mode)}: it must be one of ${RENDER_MODES.join(", ")}`
    );
    return "fake";
  }
  if (mode === "local") {
    errors.push(
      `env.${env}.vars.RENDER_MODE is local, which is dev only (the render server on a developer's machine)`
    );
  }
  return mode as RenderMode;
}

function siteUrlProblem(value: unknown): string | null {
  if (typeof value !== "string" || value === "") {
    return "is empty";
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "is not a URL";
  }
  if (url.protocol !== "https:") {
    return "must be https:";
  }
  if (value !== url.origin) {
    return `must be the bare origin ${url.origin} (no path, query or trailing slash)`;
  }
  if (isPlaceholderOrigin(value)) {
    return "is a placeholder: a workers.dev origin is <script>.<subdomain>.workers.dev";
  }
  if (RESERVED_HOST.test(url.hostname.replace(TRAILING_DOT, ""))) {
    return "is a reserved example or local host";
  }
  return null;
}

function checkFile(
  env: DeployEnv,
  target: Record<string, unknown>,
  errors: string[]
): RenderMode {
  const vars = isRecord(target.vars) ? target.vars : {};
  const mode = renderModeOf(env, vars, errors);
  for (const key of requiredWorkerConfig(env, mode).vars) {
    if (!filled(vars[key])) {
      errors.push(
        `env.${env}.vars.${key} is empty: it is required in ${env} (wrangler.jsonc)`
      );
    }
  }
  const siteUrl = siteUrlProblem(vars.SITE_URL);
  if (siteUrl) {
    errors.push(
      `env.${env}.vars.SITE_URL ${JSON.stringify(vars.SITE_URL ?? null)} ${siteUrl}`
    );
  }
  for (const binding of records(target.kv_namespaces)) {
    if (binding.id === KV_PLACEHOLDER_ID) {
      errors.push(
        `env.${env}.kv_namespaces ${String(binding.binding)} still has the placeholder id ${KV_PLACEHOLDER_ID}: create it (wrangler kv namespace create) and put its id in wrangler.jsonc`
      );
    }
  }
  for (const binding of records(target.d1_databases)) {
    if (binding.database_id === D1_PLACEHOLDER_ID) {
      errors.push(
        `env.${env}.d1_databases ${String(binding.binding)} still has the placeholder database_id ${D1_PLACEHOLDER_ID}: create it (wrangler d1 create) and put its id in wrangler.jsonc`
      );
    }
  }
  return mode;
}

function checkSecrets(
  env: DeployEnv,
  mode: RenderMode,
  vars: Record<string, unknown>,
  secrets: readonly string[],
  result: DeployConfigResult
): void {
  const has = new Set(secrets);
  for (const key of requiredWorkerConfig(env, mode).secrets) {
    if (!has.has(key)) {
      result.errors.push(
        `the secret ${key} is not set in ${env}: wrangler secret put ${key} --env ${env}`
      );
    }
  }
  const providers = new Set<string>(
    PROVIDER_SECRET_GROUPS.map((group) => group.name)
  );
  for (const group of RECOMMENDED_WORKER_CONFIG) {
    const missing = group.secrets.filter((key) => !has.has(key));
    if (missing.length === group.secrets.length) {
      result.recommended.push(
        `${group.name}: not configured (${group.secrets.join(", ")})`
      );
    } else if (missing.length > 0) {
      const line = `${group.name} is partly configured in ${env}: it needs ${group.secrets.join(", ")} together; missing ${missing.join(", ")}`;
      (providers.has(group.name) ? result.errors : result.warnings).push(line);
    }
  }
  result.errors.push(...checkR2Identity(env, vars, has));
}

/** The presigned PUT needs the whole S3 identity, or none of it. */
function checkR2Identity(
  env: DeployEnv,
  vars: Record<string, unknown>,
  has: ReadonlySet<string>
): string[] {
  if (!R2_TOKENS.some((key) => has.has(key))) {
    return [];
  }
  return [
    ...R2_TOKENS.filter((key) => !has.has(key)).map(
      (key) =>
        `the secret ${key} is not set in ${env}: the R2 tokens go together (wrangler secret put ${key} --env ${env})`
    ),
    ...R2_VARS.filter((key) => !filled(vars[key])).map(
      (key) =>
        `env.${env}.vars.${key} is empty: it is required with the R2 tokens (the presigned logo upload)`
    ),
  ];
}

/**
 * Checks `env.<env>` of `wrangler.jsonc`, and its secret names when given,
 * against what a deploy of that env needs. Pure: no file, no wrangler.
 */
export function checkDeployConfig({
  env,
  secrets,
  wrangler,
}: DeployConfigInput): DeployConfigResult {
  const result: DeployConfigResult = {
    errors: [],
    recommended: [],
    warnings: [],
  };
  const config: unknown = Bun.JSONC.parse(wrangler);
  const envs = isRecord(config) && isRecord(config.env) ? config.env : {};
  const target = envs[env];
  if (!isRecord(target)) {
    result.errors.push(`wrangler.jsonc has no env.${env}`);
    return result;
  }
  const mode = checkFile(env, target, result.errors);
  if (secrets !== null) {
    const vars = isRecord(target.vars) ? target.vars : {};
    checkSecrets(env, mode, vars, secrets, result);
  }
  return result;
}

const ARRAY_START = /^\s*\[/;
const ARRAY_END = /\]\s*$/;
const SNIPPET_LENGTH = 200;

function snippet(text: string): string {
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length > SNIPPET_LENGTH
    ? `${flat.slice(0, SNIPPET_LENGTH)}…`
    : flat;
}

/**
 * The secret names in `wrangler secret list --format json`'s stdout:
 * wrangler 4.147.0 prints `JSON.stringify([{ name, type }], null, "  ")`.
 * Lines before the array (a banner, an update or proxy notice) and after
 * it (a log notice) are skipped. Anything else throws.
 */
export function parseSecretList(stdout: string): string[] {
  const lines = stdout.split("\n");
  const start = lines.findIndex((line) => ARRAY_START.test(line));
  const end = lines.findLastIndex((line) => ARRAY_END.test(line));
  let parsed: unknown;
  if (start !== -1 && end >= start) {
    try {
      parsed = JSON.parse(lines.slice(start, end + 1).join("\n"));
    } catch {
      parsed = undefined;
    }
  }
  if (
    !(
      Array.isArray(parsed) &&
      parsed.every((entry) => isRecord(entry) && typeof entry.name === "string")
    )
  ) {
    throw new Error(
      `wrangler secret list printed no JSON list of secrets: ${JSON.stringify(snippet(stdout))}`
    );
  }
  return parsed.map((entry) => String((entry as { name: string }).name));
}

const WORKER_NOT_FOUND =
  /Worker "[^"]*"[^\n]* not found|\[code: 10007\]|script_not_found/i;
const NO_TOKEN = /non-interactive environment|CLOUDFLARE_API_TOKEN/;
const AUTH_FAILED =
  /\[code: 1000[01]\]|Authentication error|\(403\)|\b403 Forbidden\b|Unauthorized|permission/i;

/** What a failed `wrangler secret list` means, and what to do about it. */
export function explainSecretListFailure(
  result: WranglerResult,
  env: DeployEnv
): string {
  const output = `${result.stdout}\n${result.stderr}`;
  const base = `wrangler secret list --env ${env} failed (exit ${result.code})`;
  if (WORKER_NOT_FOUND.test(output)) {
    return `${base}: the ${env} Worker does not exist yet. Set its secrets first with \`wrangler secret put <NAME> --env ${env}\`, which creates the Worker, then deploy again.`;
  }
  if (NO_TOKEN.test(output)) {
    return `${base}: CLOUDFLARE_API_TOKEN is not set (and CLOUDFLARE_ACCOUNT_ID with it).`;
  }
  if (AUTH_FAILED.test(output)) {
    return `${base}: the API token (CLOUDFLARE_API_TOKEN) cannot read the Worker's secrets. It needs Account › Workers Scripts: Read (Edit includes it) on the account CLOUDFLARE_ACCOUNT_ID names.`;
  }
  const last = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  return last ? `${base}: ${snippet(last)}` : base;
}

async function listSecrets(
  run: CommandRunner,
  env: DeployEnv
): Promise<string[]> {
  let result: WranglerResult;
  try {
    result = await run(["secret", "list", "--env", env, "--format", "json"]);
  } catch (error) {
    throw new Error(
      `wrangler secret list --env ${env} could not run: ${message(error)}`,
      { cause: error }
    );
  }
  if (result.code !== 0) {
    throw new Error(explainSecretListFailure(result, env));
  }
  return parseSecretList(result.stdout);
}

interface CheckArgs {
  env: DeployEnv;
  offline: boolean;
}

const FLAGS = new Set(["--offline", "--warn-only"]);

function argEnv(argv: readonly string[]): string | undefined {
  const at = argv.indexOf("--env");
  if (at !== -1) {
    return argv[at + 1];
  }
  return argv.find((arg) => arg.startsWith("--env="))?.slice("--env=".length);
}

function parseCheckArgs(argv: readonly string[]): CheckArgs {
  const env = argEnv(argv);
  if (env !== "staging" && env !== "production") {
    throw new Error(
      `--env must be staging or production, got ${JSON.stringify(env ?? null)}`
    );
  }
  const unknown = argv.filter(
    (arg, index) =>
      !(
        FLAGS.has(arg) ||
        arg === "--env" ||
        arg.startsWith("--env=") ||
        argv[index - 1] === "--env"
      )
  );
  if (unknown.length > 0) {
    throw new Error(`unknown arguments: ${unknown.join(" ")}`);
  }
  return { env, offline: argv.includes("--offline") };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function check(
  argv: readonly string[],
  run: CommandRunner,
  log: Logger,
  readWrangler: () => Promise<string>,
  problems: string[]
): Promise<void> {
  const { env, offline } = parseCheckArgs(argv);
  const wrangler = await readWrangler();
  let secrets: string[] | null = null;
  if (!offline) {
    try {
      secrets = await listSecrets(run, env);
    } catch (error) {
      // The file checks still run: report every problem at once.
      problems.push(message(error));
    }
  }
  const result = checkDeployConfig({ env, secrets, wrangler });
  problems.push(...result.errors);
  for (const warning of result.warnings) {
    log.log(`::warning::${TAG} ${warning}`);
  }
  for (const line of result.recommended) {
    log.log(`${TAG} recommended, not configured: ${line}`);
  }
  if (problems.length === 0) {
    const scope = offline
      ? "secrets not checked (--offline)"
      : `${secrets?.length ?? 0} secrets listed`;
    log.log(`${TAG} ${env}: ok, ${scope}`);
  }
}

/**
 * The command: 0 when the env may deploy, 1 otherwise. With `--warn-only`
 * (refused for production) every problem, and every unexpected failure
 * (a runner that throws, wrangler's exit, output that is not JSON, an
 * unreadable config, a logger that throws), is a `::warning::` and the
 * result is 0.
 */
export async function runCheck(
  argv: readonly string[],
  run: CommandRunner,
  log: Logger,
  readWrangler: () => Promise<string> = () =>
    Bun.file(join(SITE_DIR, "wrangler.jsonc")).text()
): Promise<number> {
  const warnOnly = argv.includes("--warn-only");
  if (warnOnly && argEnv(argv) === "production") {
    log.error(
      `${TAG} --warn-only is refused for production: production always enforces the deploy config`
    );
    return 1;
  }
  const problems: string[] = [];
  try {
    await check(argv, run, log, readWrangler, problems);
  } catch (error) {
    problems.push(`the check failed: ${message(error)}`);
  }
  if (problems.length === 0) {
    return 0;
  }
  if (!warnOnly) {
    for (const problem of problems) {
      log.error(`${TAG} ${problem}`);
    }
    return 1;
  }
  try {
    for (const problem of problems) {
      log.log(`::warning::${TAG} ${problem}`);
    }
    log.log(
      `${TAG} warn-only: these do not stop this deploy. Set the GitHub environment variable SMOG_REQUIRE_SECRETS=1 to enforce them.`
    );
  } catch {
    // Warn-only never fails the deploy, not even on a broken stdout.
  }
  return 0;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  try {
    process.exitCode = await runCheck(argv, bunxWrangler, {
      error: console.error,
      log: console.log,
    });
  } catch (error) {
    const warnOnly =
      argv.includes("--warn-only") && argEnv(argv) !== "production";
    console.log(
      `${warnOnly ? "::warning::" : ""}${TAG} the check failed: ${message(error)}`
    );
    process.exitCode = warnOnly ? 0 : 1;
  }
}
