/**
 * `apply --env <dev|staging|production> --out <dir> [--dry-run] [--yes]
 * [--reset] [--native-catalog]` (phase 8 ruling 14). Bun only.
 *
 * In this order, and nothing is written before the last check passed:
 * 1. The flags: production needs `--yes` (unless `--dry-run`) and refuses
 *    `--reset`; `--native-catalog` needs `--reset` and is not for
 *    production.
 * 2. The plan folder: `manifest.json` must parse, and every file it lists
 *    must still have its size and SHA-256 (a changed file is refused). The
 *    hashed `preflight.json` names the plan's target, blocker count and
 *    the SHA-256 of `report.json`: the manifest and the report must agree
 *    with it (an edited manifest or report is refused, task 10 review
 *    I-2). Then the plan must have no blockers and match the env (B2:
 *    staging takes only a staging plan, production only a production plan,
 *    dev either).
 * 3. The preflight (`runPreflight`, reads only): the migrations, the
 *    maintenance key, the slugs, share tokens and Mollie ids, the claimed
 *    addresses and the admins.
 * 4. With `--dry-run`: print every wrangler command it would run, and stop.
 *    Nothing reaches D1 or KV; only `apply-report.json` (and, with
 *    `--native-catalog`, `reset-native-catalog.sql`) are written to `--out`.
 * 5. `--reset`: `reset-imported-*.sql` (from the manifest), then with
 *    `--native-catalog` `reset-native-catalog.sql` (the native rows whose
 *    slugs collide, and their `gesture_fts` rows).
 * 6. The files in manifest order, each with `d1 execute --file`.
 * 7. `catalog:version` gets a new value, then the counts are verified. On
 *    production, a table holding more rows than the report is a loud
 *    warning (the first import runs under maintenance, so it should not
 *    happen there); fewer rows fail.
 *
 * `apply-report.json` in `--out` records the result, whatever it is,
 * including the claimed addresses (personal data, like the SQL). The
 * output names counts, ids and files, never an address.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  FILE_GROUPS,
  ftsRebuildStatements,
  type Manifest,
  PREFLIGHT_FILE,
  sqlLiteral,
} from "../core/emit";
import {
  type ApplyEnv,
  type D1Query,
  isApplyEnv,
  type NativeCatalog,
  type PreflightFacts,
  type PreflightResult,
  preflightFactsSchema,
  runPreflight,
  type VerifiedCount,
  verifyCounts,
} from "../core/preflight";
import type { Report } from "../core/report";
import { TARGETS, type Target } from "../core/target";
import { d1ExecuteArgs, kvPutArgs, type Wrangler } from "./wrangler";

const PREFIX = "[migrate-convex]";
const APPLY_REPORT_FILE = "apply-report.json";
const NATIVE_CATALOG_FILE = "reset-native-catalog.sql";
/** The KV key of the catalogue's version (`@smog/gestures/server`). */
const CATALOG_VERSION_KEY = "catalog:version";
/** The KV key of the maintenance setting (`@smog/config/maintenance`). */
const MAINTENANCE_KEY = "maintenance";

export interface ApplyRequest {
  readonly dryRun: boolean;
  readonly env: string;
  readonly nativeCatalog: boolean;
  readonly outDir: string;
  readonly reset: boolean;
  readonly yes: boolean;
}

export interface ApplyContext {
  /** The new `catalog:version` (a UUID by default). */
  readonly newVersion?: () => string;
  readonly now?: () => Date;
  readonly wrangler: Wrangler;
}

interface Output {
  error: (text: string) => void;
  log: (text: string) => void;
}

const manifestFileSchema = z.strictObject({
  bytes: z.number().int().nonnegative(),
  name: z.string().regex(/^[a-z0-9-]+\.(sql|json)$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  statements: z.number().int().nonnegative(),
});

const manifestSchema = z.strictObject({
  files: z.array(manifestFileSchema.extend({ group: z.enum(FILE_GROUPS) })),
  inputs: z.strictObject({
    export: z.string(),
    muxMap: z.string().nullable(),
    overrides: z.string().nullable(),
    workosUsers: z.string().nullable(),
  }),
  now: z.string(),
  preflight: manifestFileSchema,
  report: z.strictObject({
    blockers: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
  }),
  reset: z.array(manifestFileSchema),
  target: z.enum(TARGETS),
  version: z.literal(1),
});

/** A refusal before anything is written: the reason, and exit 1. */
export class ApplyRefusal extends Error {}

/** The env a manifest's target may be applied to (B2). */
function targetFits(env: ApplyEnv, target: Target): boolean {
  return env === "dev" || env === target;
}

function checkFlags(request: ApplyRequest): ApplyEnv {
  const { env } = request;
  if (!isApplyEnv(env)) {
    throw new ApplyRefusal("--env must be dev, staging or production.");
  }
  if (env === "production" && request.reset) {
    throw new ApplyRefusal(
      "--reset is refused on production: the import there runs once (ruling 14)."
    );
  }
  if (request.nativeCatalog && !request.reset) {
    throw new ApplyRefusal("--native-catalog needs --reset.");
  }
  if (env === "production" && !request.yes && !request.dryRun) {
    throw new ApplyRefusal(
      "apply --env production needs --yes (try --dry-run first)."
    );
  }
  return env;
}

function readManifest(outDir: string): Manifest {
  const path = join(outDir, "manifest.json");
  if (!existsSync(path)) {
    throw new ApplyRefusal(`${path} does not exist: run plan first.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ApplyRefusal(`${path} is not valid JSON.`, { cause: error });
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApplyRefusal(
      `${path} is not a plan manifest (${parsed.error.issues.length} problem(s), first at ${parsed.error.issues[0]?.path.join(".") || "the top"}).`
    );
  }
  return parsed.data;
}

function sha256(text: string): string {
  return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

/** Every file the manifest lists, checked against its size and hash; their texts by name. */
function readPlanFiles(
  outDir: string,
  manifest: Manifest
): Map<string, string> {
  const texts = new Map<string, string>();
  const changed: string[] = [];
  for (const file of [
    ...manifest.files,
    ...manifest.reset,
    manifest.preflight,
  ]) {
    const path = join(outDir, file.name);
    if (!existsSync(path)) {
      changed.push(`${file.name} (missing)`);
      continue;
    }
    const content = readFileSync(path, "utf8");
    if (
      Buffer.byteLength(content) !== file.bytes ||
      sha256(content) !== file.sha256
    ) {
      changed.push(file.name);
      continue;
    }
    texts.set(file.name, content);
  }
  if (changed.length > 0) {
    throw new ApplyRefusal(
      `The plan folder does not match its manifest: ${changed.join(", ")}. Plan again; never edit a plan file.`
    );
  }
  return texts;
}

function readFacts(text: string): PreflightFacts {
  const parsed = preflightFactsSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new ApplyRefusal(`${PREFLIGHT_FILE} is not a plan's preflight file.`);
  }
  return parsed.data;
}

/** The statements of `reset-native-catalog.sql`, or none. */
function nativeCatalogStatements(native: NativeCatalog): string[] {
  const list = (ids: readonly string[]) =>
    `(SELECT value FROM json_each(${sqlLiteral(JSON.stringify(ids))}))`;
  const statements: string[] = [];
  if (native.gestures.length > 0) {
    statements.push(
      `DELETE FROM "gesture" WHERE "legacy_id" IS NULL AND "id" IN ${list(native.gestures)};`
    );
  }
  if (native.categories.length > 0) {
    statements.push(
      `DELETE FROM "category" WHERE "legacy_id" IS NULL AND "id" IN ${list(native.categories)};`
    );
  }
  statements.push(
    ...ftsRebuildStatements([...native.gestures, ...native.ftsGestures])
  );
  return statements;
}

interface Step {
  readonly args: readonly string[];
  readonly file: string;
}

function fileStep(env: ApplyEnv, outDir: string, name: string): Step {
  const file = join(outDir, name);
  return { args: d1ExecuteArgs(env, { file }), file };
}

function d1Query(wrangler: Wrangler): D1Query {
  return async (sql) => {
    const [first] = await wrangler.d1Execute({ command: sql });
    return [...(first?.results ?? [])];
  };
}

interface ApplyRecord {
  catalogVersion?: string;
  counts?: VerifiedCount[];
  dryRun: boolean;
  env: ApplyEnv;
  /** The files that ran, in order, recorded as each completes. */
  filesApplied: string[];
  manifestSha256: string;
  nativeCatalog: boolean;
  preflight?: PreflightResult;
  reset: boolean;
  startedAt: string;
  status:
    | "refused"
    | "dry-run"
    | "failed"
    | "files_applied"
    | "applied"
    | "verification-failed";
  steps: string[];
  target: Target;
  version: 1;
}

function writeRecord(outDir: string, record: ApplyRecord): void {
  writeFileSync(
    join(outDir, APPLY_REPORT_FILE),
    `${JSON.stringify(record, null, 2)}\n`
  );
}

function printPreflight(result: PreflightResult, out: Output): void {
  const claim = result.claims.filter((line) => line.state === "claim").length;
  const claimed = result.claims.length - claim;
  out.log(
    `${PREFIX} Preflight: migration ${String(result.migration ?? "none")}, ${result.admins.d1} admin(s) in D1, ${result.admins.inserted} inserted by the plan; ${claim} existing account(s) will be claimed, ${claimed} already hold their legacy id (addresses in ${APPLY_REPORT_FILE}).`
  );
  for (const difference of result.roleDifferences) {
    out.log(
      `${PREFIX} Kept role: ${difference.legacyId} is ${difference.d1Role} in D1 and ${difference.convexRole} in Convex; the claim never changes it.`
    );
  }
  const native = result.nativeCatalog;
  if (native.gestures.length + native.categories.length > 0) {
    out.log(
      `${PREFIX} --native-catalog deletes ${native.gestures.length} native gesture(s) and ${native.categories.length} native categor(y/ies) whose slugs the plan uses.`
    );
  }
  for (const refusal of result.refusals) {
    out.error(
      `${PREFIX} Refused (${refusal.code}): ${refusal.message}${refusal.ids && refusal.ids.length > 0 ? ` Ids: ${refusal.ids.slice(0, 20).join(", ")}${refusal.ids.length > 20 ? ", …" : ""}.` : ""}`
    );
  }
}

const reportSchema = z.looseObject({
  blockers: z.number().int().nonnegative(),
  sections: z.array(
    z.looseObject({
      counts: z.record(z.string(), z.number()),
      domain: z.string(),
    })
  ),
  target: z.enum(TARGETS),
});

/** `report.json`, checked against the hash `preflight.json` holds. */
function readReport(
  outDir: string,
  facts: PreflightFacts
): Pick<Report, "sections"> {
  const path = join(outDir, "report.json");
  if (!existsSync(path)) {
    throw new ApplyRefusal(
      `${path} is missing: the verification needs the plan's report. Plan again.`
    );
  }
  const text = readFileSync(path, "utf8");
  if (sha256(text) !== facts.plan.reportSha256) {
    throw new ApplyRefusal(
      "report.json does not match the plan that made it. Plan again; never edit a plan file."
    );
  }
  const parsed = reportSchema.safeParse(JSON.parse(text));
  if (
    !parsed.success ||
    parsed.data.target !== facts.plan.target ||
    parsed.data.blockers !== facts.plan.blockers
  ) {
    throw new ApplyRefusal(
      "report.json is not this plan's report. Plan again; never edit a plan file."
    );
  }
  return parsed.data as unknown as Pick<Report, "sections">;
}

interface LoadedPlan {
  readonly facts: PreflightFacts;
  readonly manifest: Manifest;
  readonly report: Pick<Report, "sections">;
}

/** The checked plan folder: its manifest, preflight facts and report (steps 1 and 2). */
function loadPlan(request: ApplyRequest, env: ApplyEnv): LoadedPlan {
  const manifest = readManifest(request.outDir);
  const texts = readPlanFiles(request.outDir, manifest);
  const facts = readFacts(texts.get(PREFLIGHT_FILE) ?? "");
  if (
    facts.plan.target !== manifest.target ||
    facts.plan.blockers !== manifest.report.blockers
  ) {
    throw new ApplyRefusal(
      "manifest.json does not match the plan that made it (its target or blocker count was changed). Plan again; never edit a plan file."
    );
  }
  const report = readReport(request.outDir, facts);
  if (!targetFits(env, facts.plan.target)) {
    throw new ApplyRefusal(
      `The plan in ${request.outDir} was made for ${facts.plan.target}; apply --env ${env} refuses it (B2: staging never receives a production plan, and production only takes its own).`
    );
  }
  if (facts.plan.blockers > 0) {
    throw new ApplyRefusal(
      `The plan has ${facts.plan.blockers} blocker(s) (report.md lists them): fix them and plan again.`
    );
  }
  return { facts, manifest, report };
}

/** The `d1 execute --file` steps, in order: the reset (with `--reset`), then the plan's files. */
function stepsOf(
  request: ApplyRequest,
  env: ApplyEnv,
  manifest: Manifest,
  native: NativeCatalog
): Step[] {
  const steps: Step[] = [];
  if (request.reset) {
    steps.push(
      ...manifest.reset.map((file) => fileStep(env, request.outDir, file.name))
    );
    const statements = nativeCatalogStatements(native);
    if (request.nativeCatalog && statements.length > 0) {
      writeFileSync(
        join(request.outDir, NATIVE_CATALOG_FILE),
        `${statements.join("\n")}\n`
      );
      steps.push(fileStep(env, request.outDir, NATIVE_CATALOG_FILE));
    }
  }
  steps.push(
    ...manifest.files.map((file) => fileStep(env, request.outDir, file.name))
  );
  return steps;
}

async function runSteps(
  steps: readonly Step[],
  wrangler: Wrangler,
  progress: { outDir: string; record: ApplyRecord },
  out: Output
): Promise<void> {
  for (const step of steps) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: the files run in order (RESTRICT, foreign keys).
      await wrangler.d1Execute({ file: step.file });
    } catch (error) {
      out.error(
        `${PREFIX} Failed on ${step.file}; the files before it were applied. Each file is idempotent: fix the cause and run apply again.`
      );
      throw error;
    }
    progress.record.filesApplied.push(step.file);
    writeRecord(progress.outDir, progress.record);
    out.log(`${PREFIX} Applied ${step.file}.`);
  }
}

/** Step 7's verification; true when no table holds fewer rows than the report. */
async function verify(
  query: D1Query,
  report: Pick<Report, "sections">,
  record: ApplyRecord,
  out: Output
): Promise<boolean> {
  const counts = await verifyCounts(query, report);
  record.counts = counts;
  for (const count of counts) {
    out.log(
      `${PREFIX} ${count.name}: ${count.actual} in D1, ${count.expected} in the report (${count.status}).`
    );
  }
  const more = counts.filter((count) => count.status === "more");
  if (record.env === "production" && more.length > 0) {
    // Under maintenance on a fresh production D1 this should not happen
    // (task 10 review M-4): loud, recorded, but not a failure.
    out.error(
      `${PREFIX} WARNING: on production, ${more.map((count) => `${count.name} (${count.actual} in D1, ${count.expected} in the report)`).join(", ")} hold more rows than the report. Check that nothing wrote to D1 during the import.`
    );
  }
  const missing = counts.filter((count) => count.status === "missing");
  if (missing.length > 0) {
    out.error(
      `${PREFIX} Verification failed: ${missing.map((count) => count.name).join(", ")} hold fewer rows than the report.`
    );
  }
  return missing.length === 0;
}

/** Runs `apply` (see the module comment) and returns the exit code. */
export async function runApply(
  request: ApplyRequest,
  context: ApplyContext,
  out: Output
): Promise<number> {
  const env = checkFlags(request);
  const { facts, manifest, report } = loadPlan(request, env);
  const { wrangler } = context;
  if (wrangler.env !== env) {
    throw new Error(`${PREFIX} The wrangler runner is for ${wrangler.env}`);
  }
  const record: ApplyRecord = {
    dryRun: request.dryRun,
    env,
    filesApplied: [],
    manifestSha256: sha256(
      readFileSync(join(request.outDir, "manifest.json"), "utf8")
    ),
    nativeCatalog: request.nativeCatalog,
    reset: request.reset,
    startedAt: (context.now?.() ?? new Date()).toISOString(),
    status: "refused",
    steps: [],
    target: manifest.target,
    version: 1,
  };

  const query = d1Query(wrangler);
  const preflight = await runPreflight(query, {
    env,
    facts,
    maintenance: env === "dev" ? null : await wrangler.kvGet(MAINTENANCE_KEY),
    nativeCatalog: request.nativeCatalog,
    target: manifest.target,
  });
  record.preflight = preflight;
  printPreflight(preflight, out);
  if (preflight.refusals.length > 0) {
    writeRecord(request.outDir, record);
    out.error(
      `${PREFIX} apply refused: ${preflight.refusals.length} preflight problem(s). Nothing was written.`
    );
    return 1;
  }

  const steps = stepsOf(request, env, manifest, preflight.nativeCatalog);
  const version = context.newVersion?.() ?? crypto.randomUUID();
  record.steps = [
    ...steps.map((step) => `wrangler ${step.args.join(" ")}`),
    `wrangler ${kvPutArgs(env, CATALOG_VERSION_KEY, version).join(" ")}`,
  ];
  for (const line of record.steps) {
    out.log(`${PREFIX} ${request.dryRun ? "Would run" : "Runs"}: ${line}`);
  }
  if (request.dryRun) {
    record.status = "dry-run";
    writeRecord(request.outDir, record);
    out.log(
      `${PREFIX} Dry run: nothing was written to D1 or KV (${APPLY_REPORT_FILE} records it).`
    );
    return 0;
  }

  record.status = "failed";
  try {
    await runSteps(steps, wrangler, { outDir: request.outDir, record }, out);
  } finally {
    writeRecord(request.outDir, record);
  }
  // Every file ran: recorded before the bump and the verification, so a
  // failure there still shows the import itself completed (review M-5).
  record.status = "files_applied";
  writeRecord(request.outDir, record);
  await wrangler.kvPut(CATALOG_VERSION_KEY, version);
  record.catalogVersion = version;
  const verified = await verify(query, report, record, out);
  record.status = verified ? "applied" : "verification-failed";
  writeRecord(request.outDir, record);
  if (!verified) {
    return 1;
  }
  out.log(
    `${PREFIX} Applied the ${manifest.target} plan to ${env}; ${APPLY_REPORT_FILE} records it.`
  );
  return 0;
}
