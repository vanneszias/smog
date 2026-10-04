import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import {
  ENVIRONMENTS,
  type Environment,
  RENDER_MODES,
  type RenderMode,
  requiredWorkerConfig,
  workerSecretsSchema,
  workerVarsSchema,
} from "@smog/config/env/worker";
import { CRON } from "@smog/jobs/cron";

/**
 * Static checks on the release plumbing: the CI and deploy workflows, the
 * site's wrangler envs (and their phase 6 queues, bucket and crons), the
 * required worker config and the app-link files against the Expo config. Each `check*` function returns a list of problems; an
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
  strategy?: {
    "fail-fast"?: boolean;
    matrix?: { check?: string[] };
  };
  uses?: string;
}

interface Workflow {
  env?: Record<string, unknown>;
  jobs?: Record<string, Job>;
  on?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
}

const DEPLOY_COMMAND = "bun -F @smog/site deploy";
/** The CI lanes, each a `release:check:<lane>` script (phase 7 ruling 16). */
const RELEASE_LANES = ["core", "tests", "mobile", "render"];
/** The render gate's flag, a GitHub environment variable (phase 7 ruling 2). */
const RENDER_FLAG = "SMOG_RENDER_PIPELINE";
const ENSURE_COMMAND = "scripts/ensure-cloudflare-resources.ts";
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
  const gate = workflow.jobs?.["release-check"];
  const lanes = gate?.strategy?.matrix?.check ?? [];
  if (!sameList(lanes, RELEASE_LANES)) {
    errors.push(
      `${file}: release:check matrix must include core, tests, mobile and render`
    );
  }
  if (gate?.strategy?.["fail-fast"] !== false) {
    errors.push(`${file}: release:check matrix must set fail-fast: false`);
  }
  for (const event of ["push", "pull_request", "workflow_call"]) {
    if (!hasTrigger(workflow, event)) {
      errors.push(`${file}: missing the on.${event} trigger`);
    }
  }
  if (workflow.permissions?.contents !== "read") {
    errors.push(`${file}: permissions.contents must be "read"`);
  }
  const steps = gate?.steps ?? [];
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
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression, not JavaScript interpolation.
    "bun run release:check:${{ matrix.check }}",
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
    allSteps(workflow).some(
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
  errors.push(...checkEnsureStep(steps, migrations, file));
  errors.push(...checkRenderFlag(steps, file));
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

/**
 * The resources step (phase 6 ruling 12): `ensure-cloudflare-resources.ts`
 * runs before the D1 migrations (so before the deploy), creates for
 * staging, and only checks production unless SMOG_PROVISION_PRODUCTION.
 */
function checkEnsureStep(
  steps: Step[],
  migrations: number,
  file: string
): string[] {
  const at = findStepIndex(steps, ENSURE_COMMAND);
  if (at === -1) {
    return [
      `${file}: no step runs \`${ENSURE_COMMAND}\` (the queues and the R2 bucket must exist before the deploy)`,
    ];
  }
  const errors: string[] = [];
  if (migrations !== -1 && at > migrations) {
    errors.push(
      `${file}: \`${ENSURE_COMMAND}\` must run before the D1 migrations and the deploy`
    );
  }
  const step = steps[at];
  const run = step?.run ?? "";
  for (const flag of ["--create", "--check"]) {
    if (!run.includes(flag)) {
      errors.push(
        `${file}: the resources step must run ${flag} (staging creates, production checks)`
      );
    }
  }
  if (
    !(
      run.includes("SMOG_PROVISION_PRODUCTION") &&
      String(step?.env?.SMOG_PROVISION_PRODUCTION ?? "").includes(
        "vars.SMOG_PROVISION_PRODUCTION"
      )
    )
  ) {
    errors.push(
      `${file}: the resources step may create production resources only when vars.SMOG_PROVISION_PRODUCTION is 1`
    );
  }
  return errors;
}

/**
 * The render gate's flag reaches the two steps that read it (phase 7
 * ruling 2): the resources step (its Workflows and Containers probes) and
 * the deploy (the build's `config` hook). It is the GitHub environment
 * variable, so `staging` and `production` each have their own.
 */
function checkRenderFlag(steps: Step[], file: string): string[] {
  const expected = `\${{ vars.${RENDER_FLAG} }}`;
  return [ENSURE_COMMAND, DEPLOY_COMMAND].flatMap((command) => {
    const step = steps[findStepIndex(steps, command)];
    if (!step || step.env?.[RENDER_FLAG] === expected) {
      return [];
    }
    return [
      `${file}: the "${step.name ?? command}" step must pass ${RENDER_FLAG}: ${expected} (the render gate)`,
    ];
  });
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
  // The Worker trusts ENVIRONMENT for dev-only behaviour (the dev mailbox,
  // non-Secure cookies), so each env must name itself.
  const envs = isRecord(config.env) ? config.env : {};
  for (const [name, env] of Object.entries(envs).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const vars = isRecord(env) && isRecord(env.vars) ? env.vars : {};
    if (vars.ENVIRONMENT !== name) {
      errors.push(`${file}: env.${name}.vars.ENVIRONMENT must be "${name}"`);
    }
  }
  return errors;
}

/** The consumer settings of ruling 8, per queue kind. */
const CONSUMER_SETTINGS = {
  // `max_batch_timeout` 0: a batch is delivered at once (messages are
  // handled one at a time anyway), so a sign-in code never waits for one.
  email: {
    max_batch_size: 10,
    max_batch_timeout: 0,
    max_retries: 5,
    retry_delay: 30,
  },
  "sponsorship-events": {
    max_batch_size: 10,
    max_retries: 10,
    retry_delay: 30,
  },
} as const;
const QUEUE_BINDINGS = {
  EMAIL_QUEUE: "email",
  EVENTS_QUEUE: "sponsorship-events",
} as const;
const COMMENT_PREFIX = /^#\s*/;

function checkQueues(
  name: string,
  env: Record<string, unknown>,
  where: string
): string[] {
  const errors: string[] = [];
  const queues = isRecord(env.queues) ? env.queues : {};
  const producers = asArray(queues.producers).filter(isRecord);
  for (const [binding, kind] of Object.entries(QUEUE_BINDINGS)) {
    const expected = `smog-${name}-${kind}`;
    const producer = producers.find((entry) => entry.binding === binding);
    if (producer?.queue !== expected) {
      errors.push(`${where}: the producer ${binding} must be ${expected}`);
    }
  }
  const consumers = asArray(queues.consumers).filter(isRecord);
  for (const [kind, settings] of Object.entries(CONSUMER_SETTINGS)) {
    const queue = `smog-${name}-${kind}`;
    const consumer = consumers.find((entry) => entry.queue === queue);
    if (!consumer) {
      errors.push(`${where}: no consumer for ${queue}`);
      continue;
    }
    if (consumer.dead_letter_queue !== `${queue}-dlq`) {
      errors.push(
        `${where}: the consumer of ${queue} needs dead_letter_queue ${queue}-dlq`
      );
    }
    for (const [key, value] of Object.entries(settings)) {
      if (consumer[key] !== value) {
        errors.push(`${where}: the consumer of ${queue} needs ${key} ${value}`);
      }
    }
  }
  for (const consumer of consumers) {
    const known = Object.keys(CONSUMER_SETTINGS).some(
      (kind) => consumer.queue === `smog-${name}-${kind}`
    );
    if (!known) {
      errors.push(
        `${where}: unexpected consumer ${String(consumer.queue)} (worker/queues.ts dispatches email and sponsorship-events only)`
      );
    }
  }
  return errors;
}

/**
 * The phase 6 bindings of every env (ruling 12): the queues
 * `smog-<env>-email` and `smog-<env>-sponsorship-events` with their
 * producers and consumers (each with its `…-dlq`), the R2 bucket
 * `smog-<env>-media` as `MEDIA` (and `vars.MEDIA_BUCKET`), `RENDER_MODE`,
 * and the four `CRON` schedules of `@smog/jobs`.
 */
export function checkWranglerResources(source: string): string[] {
  const file = "apps/site/wrangler.jsonc";
  const config: unknown = Bun.JSONC.parse(source);
  const envs = isRecord(config) && isRecord(config.env) ? config.env : {};
  const crons = Object.values(CRON);
  const errors: string[] = [];
  for (const [name, env] of Object.entries(envs).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    if (!isRecord(env)) {
      continue;
    }
    const where = `${file}: env.${name}`;
    errors.push(...checkQueues(name, env, where));
    const bucket = `smog-${name}-media`;
    const media = asArray(env.r2_buckets)
      .filter(isRecord)
      .find((entry) => entry.binding === "MEDIA");
    if (media?.bucket_name !== bucket) {
      errors.push(`${where}: MEDIA must be the bucket ${bucket}`);
    }
    const vars = isRecord(env.vars) ? env.vars : {};
    if (vars.MEDIA_BUCKET !== bucket) {
      errors.push(`${where}: vars.MEDIA_BUCKET must be ${bucket}`);
    }
    if (!(RENDER_MODES as readonly unknown[]).includes(vars.RENDER_MODE)) {
      errors.push(
        `${where}: vars.RENDER_MODE must be one of ${RENDER_MODES.join(", ")}`
      );
    } else if (vars.RENDER_MODE === "local" && name !== "dev") {
      errors.push(`${where}: vars.RENDER_MODE=local is dev only`);
    }
    const triggers = isRecord(env.triggers) ? env.triggers : {};
    const listed = asArray(triggers.crons).map(String);
    if (!sameList(listed, crons)) {
      errors.push(
        `${where}: triggers.crons must be the CRON schedules of @smog/jobs (${crons.join(", ")})`
      );
    }
  }
  return errors;
}

/** Keys only the render gate may add (phase 7 ruling 2). */
const RENDER_GATE_KEYS = [
  "workflows",
  "containers",
  "durable_objects",
  "migrations",
] as const;

/**
 * `wrangler.jsonc` declares no Workflow, container, Durable Object or DO
 * migration, at the top or in an env: `apps/site/render-config.ts` adds
 * them at build time only when the env's render mode needs them, so
 * staging's deployed config stays as it is until the owner turns the
 * pipeline on.
 */
export function checkWranglerRenderKeys(source: string): string[] {
  const file = "apps/site/wrangler.jsonc";
  const config: unknown = Bun.JSONC.parse(source);
  if (!isRecord(config)) {
    return [];
  }
  const envs = isRecord(config.env) ? config.env : {};
  const scopes: [string, Record<string, unknown>][] = [
    ["", config],
    ...Object.entries(envs)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, env]): [string, Record<string, unknown>] => [
        `env.${name}.`,
        isRecord(env) ? env : {},
      ]),
  ];
  return scopes.flatMap(([prefix, scope]) =>
    RENDER_GATE_KEYS.filter((key) => key in scope).map(
      (key) =>
        `${file}: ${prefix}${key} is not allowed: the render gate adds it at build time (apps/site/render-config.ts)`
    )
  );
}

const RENDER_CLASSES = ["RenderSponsorshipVideo", "SmogRenderer"] as const;

/** `export { …Name… }` or `export class Name`. */
function exportsName(source: string, name: string): boolean {
  const listed = new RegExp(`\\bexport\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`);
  const declared = new RegExp(`\\bexport\\s+class\\s+${name}\\b`);
  return listed.test(source) || declared.test(source);
}

/**
 * `src/worker.ts` exports the Workflow and the Container classes, always:
 * the gate binds them only for some builds, and a Durable Object class
 * that was deployed once must stay exported.
 */
export function checkRenderClassExports(source: string): string[] {
  return RENDER_CLASSES.filter((name) => !exportsName(source, name)).map(
    (name) =>
      `apps/site/src/worker.ts: must export ${name} (a class deployed once must stay exported; the render gate binds it)`
  );
}

/**
 * The release lanes (phase 7 ruling 16): a `release:check:<lane>` script
 * per CI lane, and the local `release:check` runs each.
 */
export function checkReleaseScripts(source: string): string[] {
  const manifest: unknown = JSON.parse(source);
  const scripts =
    isRecord(manifest) && isRecord(manifest.scripts) ? manifest.scripts : {};
  const all = String(scripts["release:check"] ?? "");
  return RELEASE_LANES.flatMap((lane) => {
    const name = `release:check:${lane}`;
    if (typeof scripts[name] !== "string") {
      return [`package.json: missing the ${name} script`];
    }
    const runs = all
      .split("&&")
      .some((command) => command.trim() === `bun run ${name}`);
    return runs ? [] : [`package.json: release:check must run ${name}`];
  });
}

type RequiredLists = Record<
  Environment,
  { secrets: readonly string[]; vars: readonly string[] }
>;

/** Each env's `vars.RENDER_MODE` in `wrangler.jsonc` (`fake` when unset). */
function renderModes(wrangler: string): Record<Environment, RenderMode> {
  const config: unknown = Bun.JSONC.parse(wrangler);
  const envs = isRecord(config) && isRecord(config.env) ? config.env : {};
  const modeOf = (name: Environment): RenderMode => {
    const env = envs[name];
    const mode =
      isRecord(env) && isRecord(env.vars) ? env.vars.RENDER_MODE : undefined;
    return RENDER_MODES.find((candidate) => candidate === mode) ?? "fake";
  };
  return {
    dev: modeOf("dev"),
    production: modeOf("production"),
    staging: modeOf("staging"),
  };
}

/** `KEY=` or `# KEY=` at the start of a `.dev.vars.example` line. */
function documentsKey(devVarsExample: string, key: string): boolean {
  return devVarsExample
    .split("\n")
    .some((line) => line.replace(COMMENT_PREFIX, "").startsWith(`${key}=`));
}

/**
 * The required worker config (phase 6 ruling 12, phase 7 ruling 11). By
 * default it is `requiredWorkerConfig(env, RENDER_MODE)` at each env's mode
 * in `wrangler.jsonc`, so flipping an env to `container` requires the Mux
 * trio; a given `required` list must still cover what each env's mode
 * needs. Each key is in the env schema, each secret is documented in
 * `.dev.vars.example`, and each var is named in that env's
 * `wrangler.jsonc` vars (empty means "set before launch").
 */
export function checkRequiredConfig({
  devVarsExample,
  required,
  wrangler,
}: {
  devVarsExample: string;
  required?: RequiredLists;
  wrangler: string;
}): string[] {
  const config: unknown = Bun.JSONC.parse(wrangler);
  const envs = isRecord(config) && isRecord(config.env) ? config.env : {};
  const modes = renderModes(wrangler);
  const byMode: RequiredLists = {
    dev: requiredWorkerConfig("dev", modes.dev),
    production: requiredWorkerConfig("production", modes.production),
    staging: requiredWorkerConfig("staging", modes.staging),
  };
  const lists = required ?? byMode;
  const uncovered = ENVIRONMENTS.flatMap((name) =>
    byMode[name].secrets
      .filter((key) => !lists[name].secrets.includes(key))
      .map(
        (key) =>
          `REQUIRED_WORKER_CONFIG.${name}: RENDER_MODE=${modes[name]} needs ${key}`
      )
  );
  return [...uncovered, ...checkRequiredLists(lists, envs, devVarsExample)];
}

function checkRequiredLists(
  lists: RequiredLists,
  envs: Record<string, unknown>,
  devVarsExample: string
): string[] {
  return Object.entries(lists).flatMap(([name, keys]) => {
    const env = envs[name];
    const vars = isRecord(env) && isRecord(env.vars) ? env.vars : {};
    return [
      ...keys.secrets.flatMap((key) =>
        checkRequiredSecret(name, key, devVarsExample)
      ),
      ...keys.vars.flatMap((key) => checkRequiredVar(name, key, vars)),
    ];
  });
}

function checkRequiredSecret(
  env: string,
  key: string,
  devVarsExample: string
): string[] {
  const errors: string[] = [];
  if (!(key in workerSecretsSchema.shape)) {
    errors.push(
      `REQUIRED_WORKER_CONFIG.${env}: ${key} is not in workerSecretsSchema`
    );
  }
  if (!documentsKey(devVarsExample, key)) {
    errors.push(
      `apps/site/.dev.vars.example: must document ${key} (required in ${env})`
    );
  }
  return errors;
}

function checkRequiredVar(
  env: string,
  key: string,
  vars: Record<string, unknown>
): string[] {
  if (!(key in workerVarsSchema.shape)) {
    return [`REQUIRED_WORKER_CONFIG.${env}: ${key} is not in workerVarsSchema`];
  }
  return key in vars
    ? []
    : [
        `apps/site/wrangler.jsonc: env.${env}.vars must name ${key} (REQUIRED_WORKER_CONFIG)`,
      ];
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

/** What the app-link files must agree on (`apps/mobile/app.config.ts`). */
export interface AppLinkIdentity {
  androidPackage: string;
  bundleId: string;
  /** The verified https intent filters' `pathPrefix`es, e.g. `/gestures/`. */
  pathPrefixes: string[];
  /** Their exact `path`s, e.g. `/magic-link/app` (no wildcard in the AASA). */
  paths: string[];
  teamId: string;
}

const APP_CONFIG = "apps/mobile/app.config.ts";
const AASA_FILE = "apps/site/public/.well-known/apple-app-site-association";
const ASSETLINKS_FILE = "apps/site/public/.well-known/assetlinks.json";
const HEADERS_FILE = "apps/site/public/_headers";
const HANDLE_ALL_URLS = "delegate_permission/common.handle_all_urls";
/** Play's app-signing key, as Play Console shows it (inventory P-20). */
const SHA256_FINGERPRINT = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;
const INDENTED = /^\s/;

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The ids and verified app-link paths of an Expo config, or its problems. */
export function appLinkIdentity(config: unknown): AppLinkIdentity | string[] {
  const ios = isRecord(config) && isRecord(config.ios) ? config.ios : {};
  const android =
    isRecord(config) && isRecord(config.android) ? config.android : {};
  const { appleTeamId, bundleIdentifier } = ios;
  const androidPackage = android.package;
  if (
    typeof appleTeamId !== "string" ||
    typeof bundleIdentifier !== "string" ||
    typeof androidPackage !== "string"
  ) {
    return [
      `${APP_CONFIG}: ios.appleTeamId, ios.bundleIdentifier and android.package are required`,
    ];
  }
  const verified = asArray(android.intentFilters)
    .filter((filter) => isRecord(filter) && filter.autoVerify === true)
    .flatMap((filter) => asArray(isRecord(filter) ? filter.data : undefined))
    .filter(
      (data): data is Record<string, unknown> =>
        isRecord(data) && data.scheme === "https"
    );
  const strings = (key: "path" | "pathPrefix"): string[] =>
    verified.flatMap((data) => {
      const value = data[key];
      return typeof value === "string" ? [value] : [];
    });
  return {
    androidPackage,
    bundleId: bundleIdentifier,
    pathPrefixes: strings("pathPrefix"),
    paths: strings("path"),
    teamId: appleTeamId,
  };
}

function parseJson(source: string, file: string, errors: string[]): unknown {
  try {
    return JSON.parse(source);
  } catch {
    errors.push(`${file}: invalid JSON`);
  }
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

function checkAasa(source: string, app: AppLinkIdentity): string[] {
  const errors: string[] = [];
  const parsed = parseJson(source, AASA_FILE, errors);
  if (errors.length > 0) {
    return errors;
  }
  const applinks =
    isRecord(parsed) && isRecord(parsed.applinks) ? parsed.applinks : {};
  const details = asArray(applinks.details).filter(isRecord);
  const appIDs = details.flatMap((detail) => asArray(detail.appIDs));
  const paths = details.flatMap((detail) =>
    asArray(detail.components).flatMap((component) =>
      isRecord(component) && typeof component["/"] === "string"
        ? [component["/"]]
        : []
    )
  );
  const appId = `${app.teamId}.${app.bundleId}`;
  if (!sameList(appIDs.map(String), [appId])) {
    errors.push(`${AASA_FILE}: appIDs must be ${JSON.stringify([appId])}`);
  }
  const expected = [
    ...app.pathPrefixes.map((prefix) => `${prefix}*`),
    ...app.paths,
  ];
  if (!sameList(paths, expected)) {
    errors.push(
      `${AASA_FILE}: components must be ${JSON.stringify(expected)} (app.config.ts intent filters)`
    );
  }
  return errors;
}

function checkAssetlinks(source: string, app: AppLinkIdentity): string[] {
  const errors: string[] = [];
  const parsed = parseJson(source, ASSETLINKS_FILE, errors);
  if (errors.length > 0) {
    return errors;
  }
  const statements = asArray(parsed).filter(isRecord);
  const statement = statements.find((entry) =>
    asArray(entry.relation).includes(HANDLE_ALL_URLS)
  );
  const target =
    statement && isRecord(statement.target) ? statement.target : undefined;
  if (target?.namespace !== "android_app") {
    return [
      `${ASSETLINKS_FILE}: needs an android_app statement with ${HANDLE_ALL_URLS}`,
    ];
  }
  if (target.package_name !== app.androidPackage) {
    errors.push(
      `${ASSETLINKS_FILE}: package_name must be ${JSON.stringify(app.androidPackage)}`
    );
  }
  const fingerprints = asArray(target.sha256_cert_fingerprints);
  if (fingerprints.length === 0) {
    errors.push(`${ASSETLINKS_FILE}: sha256_cert_fingerprints is empty`);
  }
  for (const fingerprint of fingerprints) {
    if (
      typeof fingerprint !== "string" ||
      !SHA256_FINGERPRINT.test(fingerprint)
    ) {
      errors.push(
        `${ASSETLINKS_FILE}: ${JSON.stringify(fingerprint)} is not an upper-case SHA-256 fingerprint`
      );
    }
  }
  return errors;
}

/** `_headers` rules: path → header name (lower case) → value. */
function parseHeaders(source: string): Map<string, Map<string, string>> {
  const rules = new Map<string, Map<string, string>>();
  let current: Map<string, string> | undefined;
  for (const line of source.split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }
    // An indented line is a header of the path above it.
    if (INDENTED.test(line)) {
      const [name = "", ...value] = line.split(":");
      current?.set(name.trim().toLowerCase(), value.join(":").trim());
    } else {
      current = new Map();
      rules.set(line.trim(), current);
    }
  }
  return rules;
}

function checkHeaders(source: string): string[] {
  const rules = parseHeaders(source);
  return [AASA_FILE, ASSETLINKS_FILE].flatMap((file) => {
    const path = file.slice("apps/site/public".length);
    return rules.get(path)?.get("content-type") === "application/json"
      ? []
      : [`${HEADERS_FILE}: ${path} needs Content-Type: application/json`];
  });
}

/**
 * The AASA and assetlinks files (static assets, spec §9) must name the app
 * that `app.config.ts` builds, for the paths it verifies, and be served as
 * `application/json` (`_headers`: an extensionless file would not be).
 */
export function checkAppLinks(
  files: { aasa: string; assetlinks: string; headers: string },
  app: AppLinkIdentity
): string[] {
  return [
    ...checkAasa(files.aasa, app),
    ...checkAssetlinks(files.assetlinks, app),
    ...checkHeaders(files.headers),
  ];
}

/** Evaluates `app.config.ts` the way Expo does (no base config). */
function loadAppConfig(root: string): unknown {
  const module = require(join(root, APP_CONFIG)) as {
    default?: (context: { config: object }) => unknown;
  };
  if (typeof module.default !== "function") {
    throw new Error(`${APP_CONFIG}: no default export function`);
  }
  return module.default({ config: {} });
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
  const app = appLinkIdentity(loadAppConfig(root));
  const appLinkErrors = Array.isArray(app)
    ? app
    : checkAppLinks(
        {
          aasa: read(AASA_FILE),
          assetlinks: read(ASSETLINKS_FILE),
          headers: read(HEADERS_FILE),
        },
        app
      );
  const resourceErrors =
    wranglerErrors.length === 0 ? checkWranglerResources(wrangler) : [];
  return [
    ...checkCiWorkflow(read(".github/workflows/ci.yml")),
    ...checkDeployWorkflow(read(".github/workflows/deploy.yml"), migrationsDir),
    ...checkReleaseScripts(read("package.json")),
    ...wranglerErrors,
    ...resourceErrors,
    ...(wranglerErrors.length === 0 ? checkWranglerRenderKeys(wrangler) : []),
    ...checkRenderClassExports(read("apps/site/src/worker.ts")),
    ...checkRequiredConfig({
      devVarsExample: read("apps/site/.dev.vars.example"),
      wrangler,
    }),
    ...appLinkErrors,
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
