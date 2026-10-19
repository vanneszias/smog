/**
 * `mux scan` and `mux renditions` (phase 8 ruling 5, carries 1 and 15).
 * Bun only.
 *
 * - `mux scan --export <zip|dir> --out <dir>` is read-only. It looks up
 *   every playback id the export uses in the Mux environment whose token
 *   is in the process env: each gesture's `playbackId` (role `current`)
 *   and the video the migrated gesture gets (`gesture`, B1's
 *   `resolveGesturePlayback`), and each sponsorship's
 *   `originalVideoPlaybackId` (`original`), `sponsoredVideoPlaybackId`
 *   (`sponsored`) and `previewVideoPlaybackId` (`preview`). It writes
 *   `mux-map.json` (`{ "<playbackId>": { assetId, renditions, roles } }`,
 *   `plan --mux-map`'s input) and `mux-scan.json` (the counts, and every
 *   playback id Mux does not know, which the map leaves out: the plan
 *   then warns and stores NULL). It counts the old preview assets: they
 *   stay in the Mux environment and nothing deletes them (a billing note).
 * - `mux renditions --map <mux-map.json> [--apply]` asks Mux for a
 *   `highest` static rendition on each **gesture** asset of the map (role
 *   `gesture`), not on every playback id of the export. It reads each
 *   asset's state live (the map's `renditions` is the scan's snapshot,
 *   informational only) and skips `ready`, `preparing` and `legacy-mp4`.
 *   It posts for `absent` and `errored` only with `--apply`: Mux bills the
 *   stored MP4, so without it the command only reads and prints what it
 *   would request. A refusal of an asset that still has the deprecated
 *   `mp4_support` is its own outcome, `legacyMp4Conflict` (DECISIONS):
 *   nothing is changed on that asset, and the owner decides.
 *
 * Both throttle Mux's two rate-limit buckets apart (task 9 review): POSTs
 * at most 1 per second (the POST bucket's refill), GETs at `--get-rate`
 * per second (2 by default; a low-priority token refills only 1 per
 * second, a high-priority one 5), and wait out a 429's `Retry-After`. The
 * owner runs them with a **low-priority** Mux token, so they never drain
 * the buckets the live site's uploads use. `mux renditions --apply` keeps `renditions-ledger.json`
 * beside the map: an asset whose rendition was requested is not looked at
 * again, so an interrupted run resumes. `MUX_TOKEN_ID` and
 * `MUX_TOKEN_SECRET` come from the process env and are never printed;
 * `MUX_API_URL` (the fake, in tests) is printed when it is set.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  assetIdForPlayback,
  createMux,
  enableStaticRendition,
  getAsset,
  type Mux,
  MuxApiError,
  type MuxAsset,
  type MuxFetch,
  type StaticRenditionState,
  staticRenditionState,
} from "@smog/video";
import { z } from "zod";
import type { ConvexExport } from "../core/export-schema";
import { resolveGesturePlaybacks } from "../core/gesture-video";
import { InputError, muxMapEntrySchema } from "../core/inputs";
import {
  Ledger,
  type ProcessEnv,
  type RateLimited,
  requireEnv,
  Throttle,
  type Timer,
  throttled,
} from "./remote";

/** Mux POSTs per second: the POST bucket refills at 1 per second. */
const MUX_POSTS_PER_SECOND = 1;
/** Mux GETs per second by default (`--get-rate`; ruling 5 allows at most 4). */
export const MUX_GET_RATE_DEFAULT = 2;
export const MUX_GET_RATE_MAX = 4;

/** What a playback id is to the export (see the module comment). */
const MUX_ROLES = [
  "gesture",
  "current",
  "original",
  "sponsored",
  "preview",
] as const;
type MuxRole = (typeof MUX_ROLES)[number];

export interface MuxOutput {
  error: (text: string) => void;
  log: (text: string) => void;
}

export interface MuxContext {
  readonly env: ProcessEnv;
  readonly fetch: MuxFetch;
  /** GETs per second (`--get-rate`); `MUX_GET_RATE_DEFAULT` when absent. */
  readonly getRate?: number;
  readonly timer: Timer;
}

const PREFIX = "[migrate-convex]";

/** The Mux client from `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` (named when missing, never printed). */
function muxFromEnv(context: MuxContext, out: MuxOutput): Mux {
  const token = requireEnv(
    context.env,
    ["MUX_TOKEN_ID", "MUX_TOKEN_SECRET"] as const,
    "an access token of the Mux environment that holds the gesture assets (production's)"
  );
  const apiUrl = context.env.MUX_API_URL?.trim();
  if (apiUrl) {
    out.log(`${PREFIX} Mux API: ${apiUrl} (MUX_API_URL)`);
  }
  const mux = createMux(
    { ...token, ...(apiUrl ? { MUX_API_URL: apiUrl } : {}) },
    { fetch: context.fetch }
  );
  if (!mux) {
    // `requireEnv` checked both; kept for the type.
    throw new InputError("The Mux access token is not set.");
  }
  return mux;
}

function muxRateLimit(error: unknown): RateLimited | null {
  return error instanceof MuxApiError && error.status === 429
    ? { retryAfterSeconds: error.retryAfterSeconds }
    : null;
}

/** A Mux call through its bucket's throttle, waiting out 429s. */
type MuxCall = <T>(call: () => Promise<T>) => Promise<T>;

/** One throttle per Mux rate-limit bucket. */
interface MuxCalls {
  readonly get: MuxCall;
  readonly post: MuxCall;
}

function muxCaller(context: MuxContext, out: MuxOutput): MuxCalls {
  const through =
    (throttle: Throttle): MuxCall =>
    (call) =>
      throttled(throttle, context.timer, muxRateLimit, call, (seconds) =>
        out.log(`${PREFIX} Mux answered 429; waiting ${seconds} s.`)
      );
  return {
    get: through(
      new Throttle(context.getRate ?? MUX_GET_RATE_DEFAULT, context.timer)
    ),
    post: through(new Throttle(MUX_POSTS_PER_SECOND, context.timer)),
  };
}

// --- mux scan ---------------------------------------------------------------

/** Every playback id the export uses, with its roles (sorted, without duplicates). */
export function exportPlaybackIds(
  data: Pick<ConvexExport, "gestures" | "sponsorships">
): Map<string, MuxRole[]> {
  const roles = new Map<string, Set<MuxRole>>();
  const add = (playbackId: string | undefined, role: MuxRole): void => {
    const id = playbackId?.trim();
    if (!id) {
      return;
    }
    const set = roles.get(id) ?? new Set<MuxRole>();
    set.add(role);
    roles.set(id, set);
  };
  const resolved = resolveGesturePlaybacks(data.gestures, data.sponsorships);
  for (const gesture of data.gestures) {
    add(gesture.playbackId, "current");
    add(resolved.get(gesture._id)?.playbackId, "gesture");
  }
  for (const row of data.sponsorships) {
    add(row.originalVideoPlaybackId, "original");
    add(row.sponsoredVideoPlaybackId, "sponsored");
    add(row.previewVideoPlaybackId, "preview");
  }
  return new Map(
    [...roles]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([id, set]) => [id, MUX_ROLES.filter((role) => set.has(role))])
  );
}

interface ScanEntry {
  readonly assetId: string;
  /** The asset's static rendition state; absent when Mux no longer had the asset. */
  readonly renditions?: StaticRenditionState;
  readonly roles: readonly MuxRole[];
}

interface ScanResult {
  /** Each playback id's asset, or null when this Mux environment does not know it. */
  readonly entries: ReadonlyMap<string, ScanEntry | null>;
  readonly summary: ScanSummary;
}

interface ScanSummary {
  readonly found: number;
  /** Found playback ids per role. */
  readonly foundByRole: Readonly<Record<MuxRole, number>>;
  readonly note: string;
  readonly playbackIds: number;
  /** Found preview assets, and those that are nothing but a preview. */
  readonly previewAssets: {
    readonly all: number;
    readonly previewOnly: number;
  };
  /** Found gesture assets per static rendition state. */
  readonly renditions: Readonly<Record<string, number>>;
  readonly unknown: readonly {
    readonly playbackId: string;
    readonly roles: readonly MuxRole[];
  }[];
}

const PREVIEW_NOTE =
  "The old preview assets (previewVideoPlaybackId) stay in this Mux environment: nothing in the new system uses or deletes them, and Mux keeps billing their storage. Deleting them is the owner's decision.";

function zeroRoles(): Record<MuxRole, number> {
  return Object.fromEntries(MUX_ROLES.map((role) => [role, 0])) as Record<
    MuxRole,
    number
  >;
}

/** Looks up every playback id of the export (read-only). */
async function scanMux(
  data: Pick<ConvexExport, "gestures" | "sponsorships">,
  mux: Mux,
  calls: MuxCalls,
  out: MuxOutput
): Promise<ScanResult> {
  const call = calls.get;
  const ids = exportPlaybackIds(data);
  const entries = new Map<string, ScanEntry | null>();
  const foundByRole = zeroRoles();
  const renditions: Record<string, number> = {};
  const unknown: { playbackId: string; roles: MuxRole[] }[] = [];
  let previewAll = 0;
  let previewOnly = 0;
  for (const [playbackId, roles] of ids) {
    // biome-ignore lint/performance/noAwaitInLoops: throttled, one call after the other (ruling 5).
    const assetId = await call(() => assetIdForPlayback(mux, playbackId));
    if (assetId === null) {
      entries.set(playbackId, null);
      unknown.push({ playbackId, roles });
      out.error(
        `${PREFIX} mux scan: warning: playback id ${playbackId} (${roles.join(", ")}) is not in this Mux environment; the plan stores NULL for it.`
      );
      continue;
    }
    const asset = await call(() => getAsset(mux, assetId));
    const state = asset ? staticRenditionState(asset) : undefined;
    entries.set(playbackId, {
      assetId,
      ...(state ? { renditions: state } : {}),
      roles,
    });
    for (const role of roles) {
      foundByRole[role] += 1;
    }
    if (roles.includes("gesture")) {
      const key = state ?? "missing";
      renditions[key] = (renditions[key] ?? 0) + 1;
    }
    if (roles.includes("preview")) {
      previewAll += 1;
      if (roles.length === 1) {
        previewOnly += 1;
      }
    }
  }
  return {
    entries,
    summary: {
      found: ids.size - unknown.length,
      foundByRole,
      note: PREVIEW_NOTE,
      playbackIds: ids.size,
      previewAssets: { all: previewAll, previewOnly },
      renditions,
      unknown,
    },
  };
}

/** `mux-map.json`: the found entries only, two-space JSON. */
function renderMuxMap(entries: ScanResult["entries"]): string {
  const map = Object.fromEntries(
    [...entries].flatMap(([playbackId, entry]) =>
      entry ? [[playbackId, entry]] : []
    )
  );
  return `${JSON.stringify(map, null, 2)}\n`;
}

export interface MuxScanOptions {
  readonly data: Pick<ConvexExport, "gestures" | "sponsorships">;
  readonly outDir: string;
}

export async function runMuxScan(
  options: MuxScanOptions,
  context: MuxContext,
  out: MuxOutput
): Promise<number> {
  const mux = muxFromEnv(context, out);
  const result = await scanMux(options.data, mux, muxCaller(context, out), out);
  mkdirSync(options.outDir, { recursive: true });
  writeFileSync(
    join(options.outDir, "mux-map.json"),
    renderMuxMap(result.entries)
  );
  writeFileSync(
    join(options.outDir, "mux-scan.json"),
    `${JSON.stringify(result.summary, null, 2)}\n`
  );
  const { summary } = result;
  out.log(
    `${PREFIX} mux scan: ${summary.found} of ${summary.playbackIds} playback id(s) found, ${summary.unknown.length} unknown; gesture assets by static rendition: ${JSON.stringify(summary.renditions)}.`
  );
  out.log(
    `${PREFIX} mux scan: ${summary.previewAssets.all} old preview asset(s), ${summary.previewAssets.previewOnly} used for nothing else. ${PREVIEW_NOTE}`
  );
  out.log(
    `${PREFIX} mux scan: wrote mux-map.json and mux-scan.json to ${options.outDir}.`
  );
  return 0;
}

// --- mux renditions -----------------------------------------------------------

/** A map entry as `mux scan` writes it: `roles` is required here. */
const renditionsMapSchema = z.record(
  z.string().min(1),
  muxMapEntrySchema.extend({
    roles: z.array(z.enum(MUX_ROLES)).min(1),
  })
);

/** What happened to one gesture asset. */
const RENDITION_OUTCOMES = [
  "requested",
  "wouldRequest",
  "ready",
  "preparing",
  "legacy-mp4",
  "legacyMp4Conflict",
  "missing",
  "failed",
  "ledger",
] as const;
type RenditionOutcome = (typeof RENDITION_OUTCOMES)[number];

const ledgerEntrySchema = z.object({
  at: z.string(),
  /** The error's status (for `failed`) or the asset's `mp4_support` (`legacyMp4Conflict`). */
  detail: z.string().optional(),
  outcome: z.enum(["requested", "legacyMp4Conflict", "failed"]),
  playbackId: z.string(),
});
type RenditionLedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const RENDITIONS_LEDGER = "renditions-ledger.json";

/** The gesture assets of a `mux scan` map: `assetId → playbackId`, by asset id. */
export function renditionTargets(text: string): Map<string, string> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new InputError("mux-map.json is not valid JSON.", { cause: error });
  }
  const parsed = renditionsMapSchema.safeParse(json);
  if (!parsed.success) {
    throw new InputError(
      'mux renditions needs the map `mux scan` writes: { "<playbackId>": { "assetId": "…", "roles": ["gesture", …] } }.'
    );
  }
  const targets = new Map<string, string>();
  for (const [playbackId, entry] of Object.entries(parsed.data)) {
    if (entry.roles.includes("gesture") && !targets.has(entry.assetId)) {
      targets.set(entry.assetId, playbackId);
    }
  }
  if (targets.size === 0) {
    throw new InputError(
      "The map has no gesture asset (role `gesture`); write it with `mux scan`."
    );
  }
  return new Map([...targets].sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** The deprecated `mp4_support` is still on (Mux refuses static renditions beside it). */
function hasLegacyMp4(asset: MuxAsset): boolean {
  return asset.mp4Support !== null && asset.mp4Support !== "none";
}

const REFUSED = new Set([400, 409, 422]);

export interface MuxRenditionsOptions {
  readonly apply: boolean;
  readonly mapPath: string;
  readonly mapText: string;
}

interface RenditionsResult {
  readonly counts: Readonly<Record<RenditionOutcome, number>>;
  /** Asset ids per outcome that needs a look: requested, would request, conflicts, missing, failed. */
  readonly ids: Readonly<Partial<Record<RenditionOutcome, string[]>>>;
}

interface RenditionStep {
  readonly at: () => string;
  readonly calls: MuxCalls;
  readonly ledger: Ledger<RenditionLedgerEntry>;
  readonly mux: Mux;
}

async function renditionFor(
  assetId: string,
  playbackId: string,
  apply: boolean,
  step: RenditionStep
): Promise<{ detail?: string; outcome: RenditionOutcome }> {
  const { calls, ledger, mux } = step;
  const asset = await calls.get(() => getAsset(mux, assetId));
  if (!asset) {
    return { outcome: "missing" };
  }
  const state = staticRenditionState(asset);
  if (state === "ready" || state === "preparing" || state === "legacy-mp4") {
    return { outcome: state };
  }
  if (!apply) {
    return {
      outcome: "wouldRequest",
      ...(hasLegacyMp4(asset)
        ? { detail: `mp4_support ${asset.mp4Support}` }
        : {}),
    };
  }
  let entry: RenditionLedgerEntry;
  try {
    const file = await calls.post(() =>
      enableStaticRendition(mux, assetId, "highest")
    );
    if (!file) {
      return { outcome: "missing" };
    }
    entry = { at: step.at(), outcome: "requested", playbackId };
  } catch (error) {
    if (
      error instanceof MuxApiError &&
      REFUSED.has(error.status) &&
      hasLegacyMp4(asset)
    ) {
      entry = {
        at: step.at(),
        detail: `mp4_support ${asset.mp4Support}`,
        outcome: "legacyMp4Conflict",
        playbackId,
      };
    } else {
      entry = {
        at: step.at(),
        detail:
          error instanceof MuxApiError
            ? `Mux answered ${error.status}`
            : "no answer",
        outcome: "failed",
        playbackId,
      };
    }
  }
  ledger.record([[assetId, entry]]);
  return {
    outcome: entry.outcome,
    ...(entry.detail ? { detail: entry.detail } : {}),
  };
}

/** Requests (or, dry, counts) the `highest` rendition of every gesture asset of the map. */
async function muxRenditions(
  options: MuxRenditionsOptions,
  mux: Mux,
  calls: MuxCalls,
  timer: Timer
): Promise<RenditionsResult> {
  const targets = renditionTargets(options.mapText);
  const ledger = Ledger.open(
    join(dirname(options.mapPath), RENDITIONS_LEDGER),
    ledgerEntrySchema
  );
  const counts = Object.fromEntries(
    RENDITION_OUTCOMES.map((outcome) => [outcome, 0])
  ) as Record<RenditionOutcome, number>;
  const ids: Partial<Record<RenditionOutcome, string[]>> = {};
  const step: RenditionStep = {
    at: () => new Date(timer.now()).toISOString(),
    calls,
    ledger,
    mux,
  };
  for (const [assetId, playbackId] of targets) {
    if (ledger.get(assetId)?.outcome === "requested") {
      counts.ledger += 1;
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: throttled, one asset after the other (ruling 5).
    const { detail, outcome } = await renditionFor(
      assetId,
      playbackId,
      options.apply,
      step
    );
    counts[outcome] += 1;
    if (
      outcome !== "ready" &&
      outcome !== "preparing" &&
      outcome !== "legacy-mp4"
    ) {
      const list = ids[outcome] ?? [];
      list.push(detail ? `${assetId} (${detail})` : assetId);
      ids[outcome] = list;
    }
  }
  return { counts, ids };
}

const COST_NOTE =
  "Billable: Mux stores one MP4 per asset and bills its storage and delivery.";

export async function runMuxRenditions(
  options: MuxRenditionsOptions,
  context: MuxContext,
  out: MuxOutput
): Promise<number> {
  const targets = renditionTargets(options.mapText);
  const mux = muxFromEnv(context, out);
  out.log(
    `${PREFIX} mux renditions${options.apply ? " --apply" : " (dry run: reads only)"}: ${targets.size} gesture asset(s) in the map.`
  );
  const { counts, ids } = await muxRenditions(
    options,
    mux,
    muxCaller(context, out),
    context.timer
  );
  out.log(`${PREFIX} mux renditions: ${JSON.stringify(counts)}.`);
  for (const [outcome, list] of Object.entries(ids)) {
    out.log(`${PREFIX} ${outcome}: ${list.join(", ")}`);
  }
  if (!options.apply) {
    out.log(
      `${PREFIX} ${counts.wouldRequest} asset(s) would get a \`highest\` static rendition (POST /video/v1/assets/<id>/static-renditions). ${COST_NOTE} Run again with --apply to request them.`
    );
    return 0;
  }
  out.log(
    `${PREFIX} ${counts.requested} rendition(s) requested. ${COST_NOTE} The ledger is ${join(dirname(options.mapPath), RENDITIONS_LEDGER)}.`
  );
  if (counts.legacyMp4Conflict > 0) {
    out.error(
      `${PREFIX} ${counts.legacyMp4Conflict} asset(s) still have the deprecated mp4_support and Mux refused a static rendition beside it (legacyMp4Conflict): nothing was changed on them. The owner decides (for example: set mp4_support to none in Mux, then run again).`
    );
  }
  if (counts.failed > 0) {
    out.error(
      `${PREFIX} ${counts.failed} request(s) failed; run again to retry them (requested ones are skipped).`
    );
    return 1;
  }
  return 0;
}
