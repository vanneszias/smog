import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

/**
 * Static checks on the release plumbing: the CI and deploy workflows and the
 * site's wrangler envs. Each `check*` function returns a list of problems; an
 * empty list means the file is fine.
 */

interface Step {
  env?: Record<string, unknown>;
  if?: string;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
  "working-directory"?: string;
}

interface Job {
  env?: Record<string, unknown>;
  environment?: unknown;
  needs?: string | string[];
  steps?: Step[];
  uses?: string;
}

interface Workflow {
  env?: Record<string, unknown>;
  jobs?: Record<string, Job>;
  on?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
}

const DEPLOY_COMMAND = "bun -F @smog/site deploy";
const MIGRATIONS_COMMAND = "wrangler d1 migrations apply DB";
const TOP_LEVEL_BINDINGS = ["d1_databases", "kv_namespaces", "r2_buckets"];
const DEPLOY_ENVS = ["staging", "production"];
const RAW_WRANGLER_DEPLOY = /\bwrangler\s+deploy\b/;
const ENV_MAPPING =
  /github\.ref_name\s*==\s*'master'\s*&&\s*'production'\s*\|\|\s*'staging'/;
const GLOB_TAIL = /\/?\*.*$/;
const HASH_FILES = /hashFiles\(\s*'([^']+)'\s*\)/;
const CI_WORKFLOW = "./.github/workflows/ci.yml";
const SITE_DIR = "apps/site";
/** Where the D1 migrations live (spec §4: `packages/db`). */
const DEFAULT_MIGRATIONS_DIR = "packages/db/migrations";
/** Wrangler's default `migrations_dir`, relative to the config file. */
const WRANGLER_DEFAULT_MIGRATIONS_DIR = "migrations";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseWorkflow(source: string, file: string): Workflow | string {
  try {
    const parsed: unknown = Bun.YAML.parse(source);
    return isRecord(parsed)
      ? (parsed as Workflow)
      : `${file}: not a YAML mapping`;
  } catch (error) {
    return `${file}: invalid YAML (${String(error)})`;
  }
}

function allSteps(workflow: Workflow): Step[] {
  return Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
}

function hasTrigger(workflow: Workflow, event: string): boolean {
  return isRecord(workflow.on) && event in workflow.on;
}

function findStepIndex(steps: Step[], command: string): number {
  return steps.findIndex((step) => step.run?.includes(command) ?? false);
}

function envMentions(value: unknown, key: string): boolean {
  return isRecord(value) && key in value;
}

export function checkCiWorkflow(source: string): string[] {
  const file = "ci.yml";
  const workflow = parseWorkflow(source, file);
  if (typeof workflow === "string") {
    return [workflow];
  }
  const errors: string[] = [];
  for (const event of ["push", "pull_request", "workflow_call"]) {
    if (!hasTrigger(workflow, event)) {
      errors.push(`${file}: missing the on.${event} trigger`);
    }
  }
  if (workflow.permissions?.contents !== "read") {
    errors.push(`${file}: permissions.contents must be "read"`);
  }
  const steps = allSteps(workflow);
  const setupBun = steps.find((step) =>
    step.uses?.startsWith("oven-sh/setup-bun@")
  );
  if (setupBun?.with?.["bun-version-file"] !== "package.json") {
    errors.push(
      `${file}: needs an oven-sh/setup-bun step with bun-version-file: package.json`
    );
  }
  for (const command of [
    "bun install --frozen-lockfile",
    "bun run release:check",
  ]) {
    if (findStepIndex(steps, command) === -1) {
      errors.push(`${file}: no step runs \`${command}\``);
    }
  }
  if (
    findStepIndex(steps, "bun run release:check") <
    findStepIndex(steps, "bun install --frozen-lockfile")
  ) {
    errors.push(
      `${file}: \`bun install --frozen-lockfile\` must run before \`bun run release:check\``
    );
  }
  const jobs = Object.values(workflow.jobs ?? {});
  const offline =
    envMentions(workflow.env, "SMOG_OFFLINE") ||
    jobs.some((job) => envMentions(job.env, "SMOG_OFFLINE")) ||
    steps.some(
      (step) =>
        envMentions(step.env, "SMOG_OFFLINE") ||
        (step.run?.includes("SMOG_OFFLINE") ?? false)
    );
  if (offline) {
    errors.push(
      `${file}: SMOG_OFFLINE must not be set in CI (expo-doctor runs its network checks there)`
    );
  }
  return errors;
}

function needsList(job: Job): string[] {
  if (job.needs === undefined) {
    return [];
  }
  return Array.isArray(job.needs) ? job.needs : [job.needs];
}

function checkMigrationsGuard(
  step: Step | undefined,
  migrationsDir: string,
  file: string
): string[] {
  const guard = step?.if?.match(HASH_FILES)?.[1];
  if (guard === undefined) {
    return [];
  }
  const guardDir = posix.dirname(guard.replace(GLOB_TAIL, "/x"));
  return guardDir === migrationsDir
    ? []
    : [
        `${file}: the D1 migrations guard checks ${guardDir}, but the migrations live in ${migrationsDir}`,
      ];
}

function checkDeployTriggers(workflow: Workflow, file: string): string[] {
  const push = isRecord(workflow.on) ? workflow.on.push : undefined;
  const branches = isRecord(push) ? push.branches : undefined;
  return ["develop", "master"]
    .filter((branch) => !(Array.isArray(branches) && branches.includes(branch)))
    .map((branch) => `${file}: on.push.branches must include ${branch}`);
}

function checkDeployGate(
  workflow: Workflow,
  deployJob: Job,
  file: string
): string[] {
  const gateJobs = Object.entries(workflow.jobs ?? {})
    .filter(([, job]) => job.uses === CI_WORKFLOW)
    .map(([id]) => id);
  if (gateJobs.length === 0) {
    return [`${file}: no job calls the release gate (uses: ${CI_WORKFLOW})`];
  }
  if (!needsList(deployJob).some((id) => gateJobs.includes(id))) {
    return [
      `${file}: jobs.deploy must list the release gate job (${gateJobs.join(", ")}) in needs`,
    ];
  }
  return [];
}

function checkDeployEnv(deployJob: Job, file: string): string[] {
  const errors: string[] = [];
  const { environment } = deployJob;
  if (typeof environment !== "string" || !ENV_MAPPING.test(environment)) {
    errors.push(
      `${file}: jobs.deploy.environment must map master → production and develop → staging`
    );
  }
  if (deployJob.env?.CLOUDFLARE_ENV !== environment) {
    errors.push(
      `${file}: jobs.deploy.env.CLOUDFLARE_ENV must equal jobs.deploy.environment`
    );
  }
  for (const secret of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) {
    if (deployJob.env?.[secret] !== `\${{ secrets.${secret} }}`) {
      errors.push(
        `${file}: jobs.deploy.env.${secret} must be the ${secret} secret`
      );
    }
  }
  return errors;
}

function checkDeploySteps(
  steps: Step[],
  migrationsDir: string,
  file: string
): string[] {
  const errors: string[] = [];
  const migrations = findStepIndex(steps, MIGRATIONS_COMMAND);
  const deploy = findStepIndex(steps, DEPLOY_COMMAND);
  if (migrations === -1) {
    errors.push(`${file}: no step runs \`${MIGRATIONS_COMMAND}\``);
  }
  if (deploy === -1) {
    errors.push(
      `${file}: no step runs \`${DEPLOY_COMMAND}\` (the guarded site deploy script)`
    );
  }
  if (migrations !== -1 && deploy !== -1 && migrations > deploy) {
    errors.push(`${file}: the D1 migrations must run before the deploy`);
  }
  if (
    steps.some(
      (step) => step.run !== undefined && RAW_WRANGLER_DEPLOY.test(step.run)
    )
  ) {
    errors.push(
      `${file}: bare \`wrangler deploy\` is not allowed; use \`${DEPLOY_COMMAND}\``
    );
  }
  errors.push(...checkMigrationsGuard(steps[migrations], migrationsDir, file));
  const skip = steps.some(
    (step) =>
      (step.run?.includes("::warning::") ?? false) &&
      step.run?.includes("CLOUDFLARE_API_TOKEN")
  );
  if (!skip) {
    errors.push(
      `${file}: a step must skip with ::warning:: when CLOUDFLARE_API_TOKEN is absent`
    );
  }
  return errors;
}

export function checkDeployWorkflow(
  source: string,
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR
): string[] {
  const file = "deploy.yml";
  const workflow = parseWorkflow(source, file);
  if (typeof workflow === "string") {
    return [workflow];
  }
  const deployJob = workflow.jobs?.deploy;
  if (!deployJob) {
    return [
      ...checkDeployTriggers(workflow, file),
      `${file}: missing the deploy job`,
    ];
  }
  return [
    ...checkDeployTriggers(workflow, file),
    ...checkDeployGate(workflow, deployJob, file),
    ...checkDeployEnv(deployJob, file),
    ...checkDeploySteps(deployJob.steps ?? [], migrationsDir, file),
  ];
}

export function checkWranglerConfig(source: string): string[] {
  const file = "apps/site/wrangler.jsonc";
  let config: unknown;
  try {
    config = Bun.JSONC.parse(source);
  } catch (error) {
    return [`${file}: invalid JSONC (${String(error)})`];
  }
  if (!isRecord(config)) {
    return [`${file}: not an object`];
  }
  const errors: string[] = [];
  for (const key of TOP_LEVEL_BINDINGS) {
    if (key in config) {
      errors.push(
        `${file}: top-level ${key} is not allowed (bindings live in env.*)`
      );
    }
  }
  for (const env of DEPLOY_ENVS) {
    if (!(isRecord(config.env) && isRecord(config.env[env]))) {
      errors.push(`${file}: missing env.${env}`);
    }
  }
  return errors;
}

/**
 * The repo-relative D1 migrations directory for the `DB` binding in the
 * deployable envs, or `packages/db/migrations` while there is no D1 yet.
 */
export function migrationsDirFromWrangler(source: string): string {
  const config: unknown = Bun.JSONC.parse(source);
  const envs = isRecord(config) && isRecord(config.env) ? config.env : {};
  const dirs = new Set<string>();
  for (const name of DEPLOY_ENVS) {
    const env = envs[name];
    const databases = isRecord(env) ? env.d1_databases : undefined;
    for (const db of Array.isArray(databases) ? databases : []) {
      if (isRecord(db) && db.binding === "DB") {
        const dir =
          typeof db.migrations_dir === "string"
            ? db.migrations_dir
            : WRANGLER_DEFAULT_MIGRATIONS_DIR;
        dirs.add(posix.join(SITE_DIR, dir));
      }
    }
  }
  if (dirs.size > 1) {
    throw new Error(
      `apps/site/wrangler.jsonc: envs disagree on migrations_dir (${[...dirs].join(", ")})`
    );
  }
  return [...dirs][0] ?? DEFAULT_MIGRATIONS_DIR;
}

export function checkReleaseConfig(root: string): string[] {
  const read = (path: string): string => readFileSync(join(root, path), "utf8");
  const wrangler = read("apps/site/wrangler.jsonc");
  const wranglerErrors = checkWranglerConfig(wrangler);
  let migrationsDir = DEFAULT_MIGRATIONS_DIR;
  if (wranglerErrors.length === 0) {
    try {
      migrationsDir = migrationsDirFromWrangler(wrangler);
    } catch (error) {
      wranglerErrors.push(String(error));
    }
  }
  return [
    ...checkCiWorkflow(read(".github/workflows/ci.yml")),
    ...checkDeployWorkflow(read(".github/workflows/deploy.yml"), migrationsDir),
    ...wranglerErrors,
  ];
}

if (import.meta.main) {
  const root = process.argv[2] ?? join(import.meta.dir, "..");
  let errors: string[];
  try {
    errors = checkReleaseConfig(root);
  } catch (error) {
    console.error("[releaseConfig] Failed to read the release config:", error);
    throw error;
  }
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[releaseConfig] ${error}`);
    }
    process.exit(1);
  }
  console.log("releaseConfig: ok");
}
