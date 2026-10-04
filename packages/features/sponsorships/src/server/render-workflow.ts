/**
 * The `RenderSponsorshipVideo` Workflow's logic (phase 7 ruling 4): one
 * render job, from `queued` to a committed video or a clean failure. It is
 * a plain function over a `RenderStep` (the site adapts the Workflow's
 * `step`) and injected ports, so it runs in the Workers pool without a
 * Workflow and never imports a Workers module.
 *
 * The steps, in order, each with its explicit `RENDER_STEP_CONFIG`:
 * 1. `start`: `queued → running` (`already-running` continues: B-2); a
 *    final or unknown job ends the instance as `noop`. It reads the input,
 *    the gesture's own asset and the sponsorship's current (previous)
 *    video asset, so a replayed `commit` cannot lose it (B-3).
 * 2. `source-lookup`: the gesture's asset behind its playback id, and
 *    temporary master access turned on.
 * 3. `source-wait-<n>` + `source-poll-<n>` (n ≤ 30, 10 s apart) until the
 *    master is `ready` or `errored`.
 * 4. `source-resolve`: the master, or the first public static rendition
 *    that answers (`highest.mp4`, then `high.mp4`), or `sourceUnavailable`.
 * 5. `logo` (with a logo only): the R2 object checked (≤ 2 MiB, PNG, JPEG
 *    or WebP by its bytes).
 * 6. `render`: the job's previous upload cancelled, a fresh Mux upload
 *    (its id stored on the job), the signed master URL re-read, then
 *    `POST /render` to the renderer. The spec's separate `upload` step is
 *    folded in (DECISIONS): each attempt gets its own upload URL. A
 *    renderer with no capacity (`busy`) is a wait, not a failure:
 *    `render-slot-wait-<n>` (n ≤ 12, 5 min apart) and `render-<n + 1>`,
 *    then `rendererBusy` (phase 7 fix wave, pipeline C-1).
 * 7. `ready-<uploadId>`: the webhook's `mux-asset-<uploadId>` event, or
 *    after an hour `ready-wait-<n>` + `ready-poll-<n>` (n ≤ 15, 2 min apart).
 * 8. `commit`: `completeRender`; the previous sponsored asset is deleted,
 *    or, when the job could not be committed, the new one (B-3).
 *
 * Whatever escapes a step after its retries runs `fail` (`failRender`, its
 * keyed admin emails, the upload cancelled) and the instance completes
 * with `{ outcome: "failed", code }`. No step output holds a signed URL
 * (I-3): the master and upload URLs are only ever read inside `render`.
 */
import type { Environment } from "@smog/config/env/worker";
import type { Db } from "@smog/db/client";
import { enqueueOutputs, type JobQueues } from "@smog/jobs";
import {
  isRetryableRenderError,
  RENDER_ERROR_CODES,
  RENDER_REQUEST_VERSION,
  type RendererPort,
  type RenderInput,
  renderInputSchema,
} from "@smog/render/contract";
import {
  assetIdForPlayback,
  cancelUpload,
  createRenderUpload,
  deleteAsset,
  enableMasterAccess,
  firstReachable,
  getAsset,
  getUpload,
  type MasterState,
  type Mux,
  masterState,
  type RenderMuxEvent,
  renditionUrls,
} from "@smog/video";
import { RENDER_ERROR_MAX } from "../schema/events";
import { LOGO_MAX_BYTES } from "../schema/wizard";
import { sniffLogoType } from "./logo";
import {
  completeRender,
  failRender,
  markRenderRunning,
  type RenderJobRecord,
  readRenderJob,
  setRenderUpload,
} from "./render";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

/** A `step.do` config, always explicit (the engine default is never used). */
export interface RenderStepConfig {
  retries: {
    backoff: "constant" | "exponential" | "linear";
    /** Milliseconds before the first retry. */
    delay: number;
    /** Retries after the first attempt. */
    limit: number;
  };
  /** Milliseconds per attempt. */
  timeout: number;
}

function stepConfig(
  limit: number,
  delay: number,
  backoff: RenderStepConfig["retries"]["backoff"],
  timeout: number
): RenderStepConfig {
  return { retries: { backoff, delay, limit }, timeout };
}

/** Every step's config (ruling 4), shared by the Workflow and the tests. */
export const RENDER_STEP_CONFIG = {
  commit: stepConfig(3, 5 * SECOND_MS, "exponential", MINUTE_MS),
  fail: stepConfig(3, 5 * SECOND_MS, "exponential", MINUTE_MS),
  logo: stepConfig(3, 5 * SECOND_MS, "constant", MINUTE_MS),
  readyPoll: stepConfig(2, 10 * SECOND_MS, "constant", MINUTE_MS),
  render: stepConfig(2, MINUTE_MS, "exponential", 20 * MINUTE_MS),
  sourceLookup: stepConfig(3, 10 * SECOND_MS, "exponential", MINUTE_MS),
  sourcePoll: stepConfig(2, 5 * SECOND_MS, "constant", MINUTE_MS),
  sourceResolve: stepConfig(3, 10 * SECOND_MS, "exponential", MINUTE_MS),
  start: stepConfig(3, 5 * SECOND_MS, "constant", MINUTE_MS),
} as const satisfies Record<string, RenderStepConfig>;

/** The polls and the wait between the steps (ruling 4). */
export const RENDER_WAITS = {
  /** Between two `ready-poll-<n>`. */
  readyPollInterval: 2 * MINUTE_MS,
  readyPolls: 15,
  /** How long `ready-<uploadId>` waits for the webhook's event. */
  readyTimeout: HOUR_MS,
  /**
   * Between a `busy` render (no renderer free) and the next attempt
   * (`render-slot-wait-<n>`, then `render-<n + 1>`).
   */
  renderSlotInterval: 5 * MINUTE_MS,
  /** Waits for a free renderer before `rendererBusy`: an hour in all. */
  renderSlotWaits: 12,
  /** Between two `source-poll-<n>`. */
  sourcePollInterval: 10 * SECOND_MS,
  sourcePolls: 30,
} as const;

/** The longest a step can take: every attempt timing out, and every retry delay. */
export function stepWorstCaseMs(config: RenderStepConfig): number {
  const { backoff, delay, limit } = config.retries;
  let delays = 0;
  for (let retry = 0; retry < limit; retry += 1) {
    if (backoff === "exponential") {
      delays += delay * 2 ** retry;
    } else if (backoff === "linear") {
      delays += delay * (retry + 1);
    } else {
      delays += delay;
    }
  }
  return (limit + 1) * config.timeout + delays;
}

/**
 * The longest straight path of one instance, every step at its worst:
 * `start`, the source (30 polls), `logo`, `render` and every slot wait
 * with its own `render-<n>` (a `busy` attempt may follow failed attempts
 * of the same step, so each counts at its worst), the hour's wait and 15
 * polls, `commit` and `fail`.
 */
export const RENDER_WORKFLOW_MAX_MS =
  stepWorstCaseMs(RENDER_STEP_CONFIG.start) +
  stepWorstCaseMs(RENDER_STEP_CONFIG.sourceLookup) +
  RENDER_WAITS.sourcePolls *
    (RENDER_WAITS.sourcePollInterval +
      stepWorstCaseMs(RENDER_STEP_CONFIG.sourcePoll)) +
  stepWorstCaseMs(RENDER_STEP_CONFIG.sourceResolve) +
  stepWorstCaseMs(RENDER_STEP_CONFIG.logo) +
  stepWorstCaseMs(RENDER_STEP_CONFIG.render) +
  RENDER_WAITS.renderSlotWaits *
    (RENDER_WAITS.renderSlotInterval +
      stepWorstCaseMs(RENDER_STEP_CONFIG.render)) +
  RENDER_WAITS.readyTimeout +
  RENDER_WAITS.readyPolls *
    (RENDER_WAITS.readyPollInterval +
      stepWorstCaseMs(RENDER_STEP_CONFIG.readyPoll)) +
  stepWorstCaseMs(RENDER_STEP_CONFIG.commit) +
  stepWorstCaseMs(RENDER_STEP_CONFIG.fail);

/**
 * How long a job may stay `queued`/`running` with an active instance
 * before the watchdog terminates it (ruling 12): the Workflow's longest
 * path plus a 30 minute margin. The clock is the job's `updated_at`, set
 * by `queued → running` (`setRenderUpload` leaves it alone). The slot
 * waits make it long (19 h 37 min); an instance that errors or ends is
 * failed by the next hourly run whatever its age.
 */
export const RENDER_WATCHDOG_CEILING = RENDER_WORKFLOW_MAX_MS + 30 * MINUTE_MS;

/**
 * The Workflow's `step`, as `runRenderJob` uses it (ruling 1). The site
 * adapts `WorkflowStep`; the tests use a fake that honours the configs.
 */
export interface RenderStep {
  do: <T>(
    name: string,
    config: RenderStepConfig,
    fn: () => Promise<T>
  ) => Promise<T>;
  sleep: (name: string, durationMs: number) => Promise<void>;
  /** The event's payload, or `null` when `timeoutMs` passed without one. */
  waitForEvent: <T>(
    name: string,
    options: { timeoutMs: number; type: string }
  ) => Promise<T | null>;
}

/** A logo as R2 holds it (`MEDIA.get`), or `null` when it is gone. */
export type ReadLogo = (key: string) => Promise<Uint8Array | null>;

export interface RenderJobDeps {
  clock: () => Date;
  db: Db;
  /** `dev` creates Mux test uploads (watermarked, deleted after 24 h). */
  environment: Environment;
  /** `null` without the Mux token: the job fails with `muxUnavailable`. */
  mux: Mux | null;
  queues: JobQueues;
  readLogo: ReadLogo;
  /** `null` without a renderer: the job fails with `rendererUnavailable`. */
  renderer: RendererPort | null;
  siteUrl: string;
}

export type RenderJobOutcome =
  | { outcome: "completed" | "noop" }
  | { code: string; outcome: "failed" };

/** Why a render job failed: the renderer's codes and the Workflow's own. */
export const RENDER_JOB_FAILURE_CODES = [
  ...RENDER_ERROR_CODES,
  "jobNotRunning",
  "logoMissing",
  "muxAssetErrored",
  "muxAssetTimeout",
  "muxUnavailable",
  "rendererBusy",
  "rendererUnavailable",
  "sourceUnavailable",
  "workflowNeverStarted",
  "workflowUnavailable",
] as const;

export type RenderJobFailureCode = (typeof RENDER_JOB_FAILURE_CODES)[number];

/**
 * `[render:<code>] <detail>`: how a failure's code survives the engine. A
 * replayed `NonRetryableError` may come back wrapped as `Step threw a
 * NonRetryableError with message "[render:…] …"`: the closing quote is
 * not part of the detail.
 */
const FAILURE_MESSAGE = /\[render:([A-Za-z]+)\] ([\s\S]*?)"?$/;

/**
 * The prefix of what the engine throws into the Workflow's code to stop it
 * (a pause, a terminate, a restart: `ABORT_REASONS` in Miniflare's
 * `workflows-shared`, e.g. `Aborting engine: User called pause`). Never a
 * failure of the job: `run` rethrows it, so a paused instance resumes
 * where it was instead of failing its job (task 6 review I-1).
 */
export const ENGINE_ABORT_PREFIX = "Aborting engine:";

/** Whether `error` is the engine stopping the instance (`ENGINE_ABORT_PREFIX`). */
export function isEngineAbort(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    String((error as { message: unknown }).message).startsWith(
      ENGINE_ABORT_PREFIX
    )
  );
}

function isFailureCode(value: string): value is RenderJobFailureCode {
  return (RENDER_JOB_FAILURE_CODES as readonly string[]).includes(value);
}

/**
 * A render job's own failure. A non-retryable one is not retried by the
 * step that throws it (the site's adapter rethrows it as `cloudflare:workflows`
 * `NonRetryableError` with the same message). The message carries the code
 * (`[render:<code>] …`), so it survives the engine's storage of a failed
 * step and a replay.
 */
export class RenderJobFailure extends Error {
  readonly code: RenderJobFailureCode;
  readonly detail: string;
  readonly retryable: boolean;

  constructor(
    code: RenderJobFailureCode,
    detail: string,
    { retryable = false }: { retryable?: boolean } = {}
  ) {
    super(`[render:${code}] ${detail}`);
    this.name = "RenderJobFailure";
    this.code = code;
    this.detail = detail;
    this.retryable = retryable;
  }
}

/**
 * The `RenderJobFailure` an error is or carries (a `NonRetryableError` or
 * a stored step error with its message), or `null`. A decoded one is not
 * retryable: it only ever crosses the engine as the final error.
 */
export function toRenderJobFailure(error: unknown): RenderJobFailure | null {
  if (error instanceof RenderJobFailure) {
    return error;
  }
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : null;
  const match = message === null ? null : FAILURE_MESSAGE.exec(message);
  const code = match?.[1];
  if (!(match && code && isFailureCode(code))) {
    return null;
  }
  return new RenderJobFailure(code, match[2] ?? "");
}

const URL_PATTERN = /\b(?:https?:\/\/|data:)\S+/gi;
const WHITESPACE = /\s+/g;

function withoutUrls(text: string): string {
  return text.replace(URL_PATTERN, "[url]").replace(WHITESPACE, " ").trim();
}

/**
 * The message a non-retryable failure crosses the engine with
 * (`NonRetryableError`, stored in the instance's state): its code and its
 * detail summarised as `summariseRenderError` does (no URL, ≤ 300).
 */
export function nonRetryableMessage(failure: RenderJobFailure): string {
  const detail = withoutUrls(failure.detail) || "unknown error";
  return `[render:${failure.code}] ${detail.slice(0, RENDER_ERROR_MAX)}`;
}

/**
 * The error stored on a failed job and logged: `code: detail` for a
 * `RenderJobFailure`, `name: message` otherwise, with every URL (signed
 * master and upload URLs, data URLs) replaced by `[url]`, at most 300
 * characters (`RENDER_ERROR_MAX`).
 */
export function summariseRenderError(error: unknown): string {
  const failure = toRenderJobFailure(error);
  let text: string;
  if (failure) {
    text = `${failure.code}: ${failure.detail}`;
  } else if (typeof error === "object" && error !== null) {
    const { message, name } = error as { message?: unknown; name?: unknown };
    text = [name, message]
      .filter((part) => typeof part === "string" && part !== "")
      .join(": ");
  } else {
    text = String(error ?? "");
  }
  const summary = withoutUrls(text);
  return (summary || "unknown error").slice(0, RENDER_ERROR_MAX);
}

/** Mux upload ids are alphanumeric; the event type keeps them as they are. */
const PLAIN_UPLOAD_ID = /^[A-Za-z0-9]{1,80}$/;

/**
 * The Workflow event type of one upload's Mux events (ruling 9, I-4):
 * `mux-asset-<uploadId>`, so an event of a superseded upload can never end
 * the wait of a later one. An id that is not 1–80 letters and digits is
 * replaced by the first 32 hex digits of its SHA-256, so the type stays
 * within Cloudflare's documented event-type rule (at most 100 characters,
 * `^[a-zA-Z0-9_][a-zA-Z0-9-_]*$`; a `.` is `workflow.invalid_event_type`).
 * Miniflare does not check it (DECISIONS).
 */
export async function renderEventType(uploadId: string): Promise<string> {
  if (PLAIN_UPLOAD_ID.test(uploadId)) {
    return `mux-asset-${uploadId}`;
  }
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(uploadId))
  );
  const hex = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `mux-asset-${hex.slice(0, 32)}`;
}

/* The steps' outputs: small JSON, never a signed URL. */

interface StartedJob {
  gestureAssetId: string | null;
  input: RenderInput;
  /** The sponsorship's video asset before this render. */
  previousAssetId: string | null;
  state: "started" | "already-running";
}

type StartOutput = StartedJob | { state: "final" | "missing" };

function isStarted(output: StartOutput): output is StartedJob {
  return output.state === "started" || output.state === "already-running";
}

type MasterStatus = MasterState["status"];

interface LookupOutput {
  assetId: string | null;
  master: MasterStatus;
}

type SourceOutput =
  | { assetId: string; kind: "master" }
  | { kind: "rendition"; url: string };

interface LogoOutput {
  bytes: number;
  sha256: string;
}

interface RenderOutput {
  frames: number;
  height: number;
  uploadId: string;
  width: number;
}

/** A render attempt that found no free renderer: the slot loop waits. */
interface BusyOutput {
  busy: true;
}

type RenderAttempt = RenderOutput | BusyOutput;

interface ReadyAsset {
  assetId: string;
  playbackId: string;
}

type ReadyPollOutput =
  | ({ state: "ready" } & ReadyAsset)
  | { error: string; state: "errored" }
  | { state: "waiting" };

function requireMux(deps: RenderJobDeps): Mux {
  if (!deps.mux) {
    throw new RenderJobFailure(
      "muxUnavailable",
      "the Mux token is not configured"
    );
  }
  return deps.mux;
}

async function startStep(
  deps: RenderJobDeps,
  renderJobId: string
): Promise<StartOutput> {
  const state = await markRenderRunning(deps.db, {
    now: deps.clock(),
    renderJobId,
  });
  if (state === "final" || state === "missing") {
    return { state };
  }
  const job = await readRenderJob(deps.db, renderJobId);
  if (!job) {
    return { state: "missing" };
  }
  const input = renderInputSchema.safeParse(job.input);
  if (!input.success) {
    throw new RenderJobFailure(
      "invalidInput",
      "the job's input does not match the render contract"
    );
  }
  return {
    gestureAssetId: job.gestureAssetId,
    input: input.data,
    previousAssetId: job.videoAssetId,
    state,
  };
}

async function lookupSource(
  deps: RenderJobDeps,
  input: RenderInput
): Promise<LookupOutput> {
  const mux = requireMux(deps);
  const assetId = await assetIdForPlayback(mux, input.sourcePlaybackId);
  if (!assetId) {
    return { assetId: null, master: "none" };
  }
  if ((await enableMasterAccess(mux, assetId)) === "missing") {
    return { assetId: null, master: "none" };
  }
  // Only the status: the ready master's URL is signed (I-3).
  const { status } = await masterState(mux, assetId);
  return { assetId, master: status };
}

/** The polls of step 3: the master's status once it settles, or `preparing`. */
async function pollMaster(
  step: RenderStep,
  deps: RenderJobDeps,
  lookup: LookupOutput
): Promise<MasterStatus> {
  const { assetId } = lookup;
  if (!assetId || lookup.master === "ready" || lookup.master === "errored") {
    return lookup.master;
  }
  for (let poll = 1; poll <= RENDER_WAITS.sourcePolls; poll += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: the polls are sequential steps, 10 s apart.
    await step.sleep(`source-wait-${poll}`, RENDER_WAITS.sourcePollInterval);
    const status = await step.do(
      `source-poll-${poll}`,
      RENDER_STEP_CONFIG.sourcePoll,
      async () => (await masterState(requireMux(deps), assetId)).status
    );
    if (status === "ready" || status === "errored") {
      return status;
    }
  }
  return "preparing";
}

async function renditionSource(
  mux: Mux,
  input: RenderInput
): Promise<string | null> {
  return await firstReachable(renditionUrls(input.sourcePlaybackId), mux.fetch);
}

async function resolveSource(
  deps: RenderJobDeps,
  input: RenderInput,
  assetId: string | null,
  master: MasterStatus
): Promise<SourceOutput> {
  const mux = requireMux(deps);
  if (assetId && master === "ready") {
    return { assetId, kind: "master" };
  }
  // Public, not signed: a rendition URL may be kept in step state.
  const url = await renditionSource(mux, input);
  if (!url) {
    throw new RenderJobFailure(
      "sourceUnavailable",
      "the gesture has no master and no static rendition"
    );
  }
  return { kind: "rendition", url };
}

/** The logo's bytes and type, checked as the checkout does, or `logoMissing`. */
async function readValidLogo(
  deps: RenderJobDeps,
  key: string
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const bytes = await deps.readLogo(key);
  const contentType = bytes ? sniffLogoType(bytes) : null;
  if (
    !(bytes && contentType) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > LOGO_MAX_BYTES
  ) {
    throw new RenderJobFailure(
      "logoMissing",
      "the logo is missing or not a PNG, JPEG or WebP of at most 2 MiB"
    );
  }
  return { bytes, contentType };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

async function checkLogo(
  deps: RenderJobDeps,
  key: string
): Promise<LogoOutput> {
  const { bytes } = await readValidLogo(deps, key);
  return { bytes: bytes.byteLength, sha256: await sha256Hex(bytes) };
}

/** Base64 in chunks (a 2 MiB logo is too long for one `String.fromCharCode`). */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x80_00;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

async function logoDataUrl(
  deps: RenderJobDeps,
  key: string,
  checked: LogoOutput
): Promise<string> {
  const { bytes, contentType } = await readValidLogo(deps, key);
  if ((await sha256Hex(bytes)) !== checked.sha256) {
    throw new RenderJobFailure(
      "logoMissing",
      "the logo changed after it was checked"
    );
  }
  return `data:${contentType};base64,${toBase64(bytes)}`;
}

/** Deletes an asset, best effort: 404 is done, a failure is logged and swallowed. */
async function dropAsset(
  mux: Mux,
  assetId: string,
  keep: readonly (string | null)[],
  why: string
): Promise<void> {
  if (keep.includes(assetId)) {
    return;
  }
  try {
    await deleteAsset(mux, assetId);
    console.log(`[sponsorships] Deleted Mux asset ${assetId} (${why})`);
  } catch (error) {
    console.error(
      `[sponsorships] Failed to delete Mux asset ${assetId} (${why}):`,
      error
    );
  }
}

/**
 * Cancels an upload, best effort; one that already made an asset has that
 * asset deleted (task 5 review, I-3), unless it is one of `keep`. A
 * failure is logged and swallowed: an asset made later from that upload
 * is not current any more, and the webhook deletes it.
 */
async function dropUpload(
  mux: Mux,
  uploadId: string,
  keep: readonly (string | null)[]
): Promise<void> {
  try {
    const cancelled = await cancelUpload(mux, uploadId);
    if (cancelled.state === "already-final" && cancelled.assetId) {
      await dropAsset(mux, cancelled.assetId, keep, "superseded upload");
    }
  } catch (error) {
    console.error(
      `[sponsorships] Failed to cancel Mux upload ${uploadId}:`,
      error
    );
  }
}

/**
 * A failed job's upload released (ruling 13: none may leak): cancelled,
 * and the asset it already made deleted, unless that asset is the
 * gesture's own or the sponsorship's video. The Workflow's `fail` and the
 * watchdog's failures both run it (phase 7 fix wave, pipeline I-1), so an
 * asset whose `asset.ready` was already handled is not left behind.
 */
export async function releaseRenderUpload(
  mux: Mux | null,
  job: Pick<RenderJobRecord, "gestureAssetId" | "muxUploadId" | "videoAssetId">
): Promise<void> {
  if (!(mux && job.muxUploadId)) {
    return;
  }
  await dropUpload(mux, job.muxUploadId, [
    job.gestureAssetId,
    job.videoAssetId,
  ]);
}

/** The URL the renderer reads, resolved inside `render` (never step state). */
async function sourceUrlOf(
  mux: Mux,
  input: RenderInput,
  source: SourceOutput
): Promise<string> {
  if (source.kind === "rendition") {
    return source.url;
  }
  const master = await masterState(mux, source.assetId);
  if (master.status === "ready") {
    return master.url;
  }
  // The master expired between the steps: the renditions are the fallback.
  const url = await renditionSource(mux, input);
  if (!url) {
    throw new RenderJobFailure(
      "sourceUnavailable",
      "the master is no longer ready and there is no static rendition"
    );
  }
  return url;
}

async function renderStep(
  deps: RenderJobDeps,
  {
    input,
    logo,
    renderJobId,
    source,
  }: {
    input: RenderInput;
    logo: LogoOutput | null;
    renderJobId: string;
    source: SourceOutput;
  }
): Promise<RenderAttempt> {
  const { renderer } = deps;
  if (!renderer) {
    throw new RenderJobFailure(
      "rendererUnavailable",
      "no renderer is configured for this render mode"
    );
  }
  const mux = requireMux(deps);
  const job = await readRenderJob(deps.db, renderJobId);
  if (job?.status !== "running") {
    throw new RenderJobFailure("jobNotRunning", "the job is not running");
  }
  const keep = [job.gestureAssetId, job.videoAssetId];
  if (job.muxUploadId) {
    // The previous attempt's upload: a retry never PUTs to it again.
    await dropUpload(mux, job.muxUploadId, keep);
  }
  const upload = await createRenderUpload(mux, {
    corsOrigin: new URL(deps.siteUrl).origin,
    renderJobId,
    test: deps.environment === "dev",
  });
  const stored = await setRenderUpload(deps.db, {
    previousUploadId: job.muxUploadId,
    renderJobId,
    uploadId: upload.id,
  });
  if (stored !== "set") {
    await dropUpload(mux, upload.id, keep);
    if (stored === "not-running") {
      throw new RenderJobFailure("jobNotRunning", "the job is not running");
    }
    // Another attempt stored its upload after this one read the job (an
    // attempt that went on past its timeout, review M-1): this one gives
    // way, and the step's next attempt starts from the stored upload.
    throw new Error(
      `[sponsorships] The upload of render job ${renderJobId} changed during this attempt`
    );
  }
  const sourceUrl = await sourceUrlOf(mux, input, source);
  const logoUrl =
    logo && input.logoKey ? await logoDataUrl(deps, input.logoKey, logo) : null;
  const result = await renderer.render({
    input,
    logoDataUrl: logoUrl,
    renderJobId,
    sourceUrl,
    uploadUrl: upload.url,
    v: RENDER_REQUEST_VERSION,
  });
  if (!result.ok && result.code === "busy") {
    // No renderer free (the platform's capacity refusal or the server's
    // own slot): a wait, not a failure. The next attempt cancels this upload.
    console.warn(
      `[sponsorships] No renderer free for render job ${renderJobId}; waiting for a slot`
    );
    return { busy: true };
  }
  if (!result.ok) {
    throw new RenderJobFailure(result.code, result.message, {
      retryable: isRetryableRenderError(result.code),
    });
  }
  return {
    frames: result.frames,
    height: result.height,
    uploadId: upload.id,
    width: result.width,
  };
}

/**
 * Step 6 with its slot waits: `render`, then while no renderer is free
 * `render-slot-wait-<n>` + `render-<n + 1>`, at most
 * `RENDER_WAITS.renderSlotWaits` times, then `rendererBusy` (final). A
 * `busy` attempt returns, so it uses none of its step's retries.
 */
async function renderWithSlot(
  step: RenderStep,
  deps: RenderJobDeps,
  args: Parameters<typeof renderStep>[1]
): Promise<RenderOutput> {
  for (let wait = 0; ; wait += 1) {
    const name = wait === 0 ? "render" : `render-${wait + 1}`;
    // biome-ignore lint/performance/noAwaitInLoops: the attempts are sequential steps, a slot wait apart.
    const attempt = await step.do(name, RENDER_STEP_CONFIG.render, () =>
      renderStep(deps, args)
    );
    if (!("busy" in attempt)) {
      return attempt;
    }
    if (wait >= RENDER_WAITS.renderSlotWaits) {
      throw new RenderJobFailure(
        "rendererBusy",
        `no renderer was free after ${RENDER_WAITS.renderSlotWaits} waits`
      );
    }
    await step.sleep(
      `render-slot-wait-${wait + 1}`,
      RENDER_WAITS.renderSlotInterval
    );
  }
}

function assetFromEvent(event: RenderMuxEvent): ReadyAsset {
  if (event.type === "asset.ready" && event.assetId && event.playbackId) {
    return { assetId: event.assetId, playbackId: event.playbackId };
  }
  throw new RenderJobFailure(
    "muxAssetErrored",
    event.error ??
      (event.type === "asset.ready"
        ? "the rendered video has no public playback id"
        : `Mux reported ${event.type}`)
  );
}

const FAILED_UPLOAD = new Set(["errored", "cancelled", "timed_out"]);

async function pollUpload(
  deps: RenderJobDeps,
  uploadId: string
): Promise<ReadyPollOutput> {
  const mux = requireMux(deps);
  const upload = await getUpload(mux, uploadId);
  if (!upload) {
    return { error: "the upload is gone", state: "errored" };
  }
  if (FAILED_UPLOAD.has(upload.status)) {
    return {
      error: upload.error ?? `the upload is ${upload.status}`,
      state: "errored",
    };
  }
  if (!upload.assetId) {
    return { state: "waiting" };
  }
  const asset = await getAsset(mux, upload.assetId);
  if (!asset) {
    return { error: "the asset is gone", state: "errored" };
  }
  if (asset.status === "errored") {
    return { error: asset.error ?? "the asset errored", state: "errored" };
  }
  if (asset.status === "ready" && asset.playbackId) {
    return { assetId: asset.id, playbackId: asset.playbackId, state: "ready" };
  }
  return { state: "waiting" };
}

/** Step 7: the webhook's event, or the polls after an hour without one. */
async function waitForAsset(
  step: RenderStep,
  deps: RenderJobDeps,
  uploadId: string
): Promise<ReadyAsset> {
  const event = await step.waitForEvent<RenderMuxEvent>(`ready-${uploadId}`, {
    timeoutMs: RENDER_WAITS.readyTimeout,
    type: await renderEventType(uploadId),
  });
  if (event) {
    return assetFromEvent(event);
  }
  for (let poll = 1; poll <= RENDER_WAITS.readyPolls; poll += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: the polls are sequential steps, 2 min apart.
    await step.sleep(`ready-wait-${poll}`, RENDER_WAITS.readyPollInterval);
    const polled = await step.do(
      `ready-poll-${poll}`,
      RENDER_STEP_CONFIG.readyPoll,
      () => pollUpload(deps, uploadId)
    );
    if (polled.state === "ready") {
      return { assetId: polled.assetId, playbackId: polled.playbackId };
    }
    if (polled.state === "errored") {
      throw new RenderJobFailure("muxAssetErrored", polled.error);
    }
  }
  throw new RenderJobFailure(
    "muxAssetTimeout",
    "the rendered video was not ready in time"
  );
}

/**
 * Step 8. The job counts as committed when the sponsorship holds the new
 * asset: then the previous sponsored asset (read in `start`) is deleted,
 * unless it is the gesture's own. Otherwise (the sponsorship left
 * `rendering`, or the watchdog failed the job first) the new asset is
 * deleted (B-3). A replay after a commit finds it committed and deletes
 * nothing new (the previous asset's delete is a 404 then).
 */
async function commitStep(
  deps: RenderJobDeps,
  {
    asset,
    gestureAssetId,
    previousAssetId,
    renderJobId,
  }: {
    asset: ReadyAsset;
    gestureAssetId: string | null;
    previousAssetId: string | null;
    renderJobId: string;
  }
): Promise<{ outcome: "completed" | "noop" }> {
  await completeRender(deps.db, {
    assetId: asset.assetId,
    now: deps.clock(),
    playbackId: asset.playbackId,
    renderJobId,
  });
  const job = await readRenderJob(deps.db, renderJobId);
  const committed = job !== null && job.videoAssetId === asset.assetId;
  if (deps.mux) {
    if (committed && previousAssetId) {
      await dropAsset(
        deps.mux,
        previousAssetId,
        [asset.assetId, gestureAssetId],
        "replaced by a new render"
      );
    } else if (!committed) {
      await dropAsset(
        deps.mux,
        asset.assetId,
        [gestureAssetId, job?.videoAssetId ?? null],
        "its job could not be committed"
      );
    }
  }
  return { outcome: committed ? "completed" : "noop" };
}

/**
 * A job that had already succeeded when `fail` ran (`completeRender`
 * committed, then `commit` was cut short: its read failed, or the
 * watchdog's terminate landed): the commit's own cleanup, the previous
 * sponsored asset deleted unless it is the video now or the gesture's own
 * (review M-2).
 */
async function finishCommitCleanup(
  deps: RenderJobDeps,
  renderJobId: string,
  previousAssetId: string | null
): Promise<void> {
  if (!(deps.mux && previousAssetId)) {
    return;
  }
  const job = await readRenderJob(deps.db, renderJobId);
  if (job?.status !== "succeeded") {
    return;
  }
  await dropAsset(
    deps.mux,
    previousAssetId,
    [job.videoAssetId, job.gestureAssetId],
    "replaced by a new render"
  );
}

/**
 * The failure path: `fail` once, then the instance completes as `failed`,
 * or as `noop` when the job was already final (review M-5: the instance's
 * outcome never contradicts D1).
 */
async function failJob(
  step: RenderStep,
  deps: RenderJobDeps,
  renderJobId: string,
  error: unknown,
  started: StartedJob | null
): Promise<RenderJobOutcome> {
  const code = toRenderJobFailure(error)?.code ?? "unexpected";
  const summary = summariseRenderError(error);
  console.error(`[sponsorships] Render job ${renderJobId} failed: ${summary}`);
  const failed = await step.do("fail", RENDER_STEP_CONFIG.fail, async () => {
    const result = await failRender(deps.db, {
      error: summary,
      now: deps.clock(),
      renderJobId,
      siteUrl: deps.siteUrl,
    });
    if (result.outcome !== "failed") {
      await finishCommitCleanup(
        deps,
        renderJobId,
        started?.previousAssetId ?? null
      );
      return { outcome: result.outcome };
    }
    // Keyed per job and admin: a replay sends nothing new.
    await enqueueOutputs(
      deps.queues,
      { events: [], notify: result.notify },
      { onFailure: "throw" }
    );
    const job = await readRenderJob(deps.db, renderJobId);
    if (job) {
      await releaseRenderUpload(deps.mux, job);
    }
    return { outcome: result.outcome };
  });
  return failed.outcome === "failed"
    ? { code, outcome: "failed" }
    : { outcome: "noop" };
}

/**
 * One render job (ruling 4; see the top of this file). Never throws for a
 * failure of the job itself: it ends as `{ outcome: "failed", code }` after
 * `fail`. Only a `fail` step that fails after its retries escapes, and the
 * watchdog picks up the errored instance.
 */
export async function runRenderJob(
  step: RenderStep,
  deps: RenderJobDeps,
  { renderJobId }: { renderJobId: string }
): Promise<RenderJobOutcome> {
  let running: StartedJob | null = null;
  try {
    const started = await step.do("start", RENDER_STEP_CONFIG.start, () =>
      startStep(deps, renderJobId)
    );
    if (!isStarted(started)) {
      console.log(
        `[sponsorships] Render job ${renderJobId} is ${started.state}: nothing to do`
      );
      return { outcome: "noop" };
    }
    running = started;
    const { input } = started;
    const lookup = await step.do(
      "source-lookup",
      RENDER_STEP_CONFIG.sourceLookup,
      () => lookupSource(deps, input)
    );
    const master = await pollMaster(step, deps, lookup);
    const source = await step.do(
      "source-resolve",
      RENDER_STEP_CONFIG.sourceResolve,
      () => resolveSource(deps, input, lookup.assetId, master)
    );
    const { logoKey } = input;
    const logo = logoKey
      ? await step.do("logo", RENDER_STEP_CONFIG.logo, () =>
          checkLogo(deps, logoKey)
        )
      : null;
    const rendered = await renderWithSlot(step, deps, {
      input,
      logo,
      renderJobId,
      source,
    });
    const asset = await waitForAsset(step, deps, rendered.uploadId);
    return await step.do("commit", RENDER_STEP_CONFIG.commit, () =>
      commitStep(deps, {
        asset,
        gestureAssetId: started.gestureAssetId,
        previousAssetId: started.previousAssetId,
        renderJobId,
      })
    );
  } catch (error) {
    if (isEngineAbort(error)) {
      throw error;
    }
    return await failJob(step, deps, renderJobId, error, running);
  }
}
