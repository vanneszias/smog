/**
 * `runRenderJob` (phase 7 ruling 4) in the Workers pool: D1, the Mux fake
 * (`@smog/video/testing`), the fake renderer (`@smog/render/testing`) and
 * the fake step (`helpers/fake-step.ts`). Each test drives one render job
 * through the steps and checks the job, the sponsorship, the Mux fake's
 * uploads and assets, and the queued admin emails.
 */
import { gesture as gestureTable, renderJob, sponsorship } from "@smog/db";
import type { EmailMessage, EventMessage, JobQueues } from "@smog/jobs";
import type {
  RendererPort,
  RenderRequest,
  RenderResult,
} from "@smog/render/contract";
import { createFakeRenderer, FAKE_RENDER_RESULT } from "@smog/render/testing";
import type { Mux, RenderMuxEvent } from "@smog/video";
import { createFakeMux, type FakeMux } from "@smog/video/testing";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderJob, failRender } from "../src/server/render";
import {
  nonRetryableMessage,
  RENDER_STEP_CONFIG,
  RENDER_WAITS,
  RENDER_WATCHDOG_CEILING,
  RENDER_WORKFLOW_MAX_MS,
  type RenderJobDeps,
  RenderJobFailure,
  renderEventType,
  runRenderJob,
  stepWorstCaseMs,
  summariseRenderError,
  toRenderJobFailure,
} from "../src/server/render-workflow";
import { clearSponsorships } from "./clean";
import { makeAdmin, NOW, SITE_URL, seedCheckout, testDb } from "./helpers";
import { createFakeStep, type FakeStep } from "./helpers/fake-step";
import { media, PNG } from "./logos";

const db = testDb();
const HASHED_EVENT_TYPE = /^mux-asset-[0-9a-f]{32}$/;

/** A Mux URL with a signature or token: never in step state (I-3). */
const SIGNED_MUX_URL =
  /https?:\/\/[^"\s]*mux\.com[^"\s]*[?&](?:signature|token|sig|X-Amz-Signature)=/i;

interface World {
  emails: EmailMessage[];
  events: EventMessage[];
  fake: FakeMux;
  mux: Mux;
  queues: JobQueues;
  /** HEAD answers of `stream.mux.com/<id>/<file>`, by file name. */
  renditions: Record<string, number>;
}

let world: World;

function recordingQueues() {
  const events: EventMessage[] = [];
  const emails: EmailMessage[] = [];
  const queues: JobQueues = {
    email: {
      send: (body) => {
        emails.push(body);
        return Promise.resolve();
      },
    },
    events: {
      send: (body) => {
        events.push(body);
        return Promise.resolve();
      },
    },
  };
  return { emails, events, queues };
}

/** The fake's client, with `stream.mux.com` answered from `renditions`. */
function muxWithRenditions(
  fake: FakeMux,
  renditions: Record<string, number>
): Mux {
  return {
    apiUrl: fake.mux.apiUrl,
    authorization: fake.mux.authorization,
    fetch: (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.host === "stream.mux.com") {
        const file = url.pathname.split("/").at(-1) ?? "";
        return Promise.resolve(
          new Response(null, { status: renditions[file] ?? 404 })
        );
      }
      return fake.fetch(input, init);
    },
  };
}

beforeEach(async () => {
  await clearSponsorships(db);
  for (const method of ["log", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => undefined);
  }
  const fake = createFakeMux();
  const renditions: Record<string, number> = {};
  world = {
    ...recordingQueues(),
    fake,
    mux: muxWithRenditions(fake, renditions),
    renditions,
  };
});

function uploadIdOf(uploadUrl: string): string {
  return new URL(uploadUrl).pathname.split("/").at(-1) ?? "";
}

/** A renderer that "PUTs" to the upload (the fake makes its asset) and succeeds. */
function puttingRenderer(
  answer: (request: RenderRequest, attempt: number) => RenderResult = () =>
    FAKE_RENDER_RESULT
) {
  let attempt = 0;
  return createFakeRenderer({
    result: (request) => {
      attempt += 1;
      const result = answer(request, attempt);
      if (result.ok) {
        world.fake.completeUpload(uploadIdOf(request.uploadUrl));
      }
      return result;
    },
  });
}

function deps(overrides: Partial<RenderJobDeps> = {}): RenderJobDeps {
  return {
    clock: () => NOW,
    db,
    environment: "dev",
    mux: world.mux,
    queues: world.queues,
    readLogo: async (key) => {
      const object = await media().get(key);
      return object ? new Uint8Array(await object.arrayBuffer()) : null;
    },
    renderer: puttingRenderer(),
    siteUrl: SITE_URL,
    ...overrides,
  };
}

/**
 * A `rendering` sponsorship with a `queued` job; its gesture's own asset
 * is in the Mux fake (and on the gesture row). With `logo`, the logo is in
 * R2. `previous` is the sponsorship's video asset before this render.
 */
async function queuedJob(
  options: { logo?: boolean; previous?: "asset" | "own" | null } = {}
) {
  const seeded = await seedCheckout(db, {
    count: 1,
    logo: options.logo ?? false,
    paymentStatus: "paid",
    status: "rendering",
  });
  const sponsorshipId = seeded.sponsorshipIds[0] as string;
  const [gesture] = seeded.gestures;
  if (!gesture) {
    throw new Error("[test] No gesture seeded");
  }
  const own = world.fake.addAsset({ playbackId: gesture.playbackId });
  await db
    .update(gestureTable)
    .set({ muxAssetId: own.id })
    .where(eq(gestureTable.id, gesture.id));
  let previousAssetId: string | null = null;
  if (options.previous === "asset") {
    previousAssetId = world.fake.addAsset({ playbackId: "previous-render" }).id;
  } else if (options.previous === "own") {
    previousAssetId = own.id;
  }
  const [row] = await db
    .update(sponsorship)
    .set({ videoAssetId: previousAssetId })
    .where(eq(sponsorship.id, sponsorshipId))
    .returning({ logoKey: sponsorship.logoKey });
  if (row?.logoKey) {
    await media().put(row.logoKey, PNG, {
      httpMetadata: { contentType: "image/png" },
    });
  }
  const job = await createRenderJob(db, { now: NOW, sponsorshipId });
  return {
    gestureAssetId: own.id,
    logoKey: row?.logoKey ?? null,
    playbackId: gesture.playbackId,
    previousAssetId,
    renderJobId: job?.renderJobId as string,
    sponsorshipId,
  };
}

/** The upload whose `mux-asset-<id>` event type this is. */
async function uploadOfType(type: string) {
  for (const upload of world.fake.uploads.values()) {
    // biome-ignore lint/performance/noAwaitInLoops: a handful of uploads.
    if ((await renderEventType(upload.id)) === type) {
      return upload;
    }
  }
  throw new Error(`[test] No upload for ${type}`);
}

/** At the wait, the asset becomes ready and the webhook's event arrives. */
function deliverReady(step: FakeStep, renderJobId: string): void {
  step.onWait = async (type) => {
    const upload = await uploadOfType(type);
    const asset = world.fake.readyAsset(upload.assetId as string);
    const event: RenderMuxEvent = {
      assetId: asset.id,
      playbackId: asset.playbackId as string,
      renderJobId,
      type: "asset.ready",
      uploadId: upload.id,
    };
    step.sendEvent(type, event);
  };
}

/** The master becomes ready at `source-wait-<at>`. */
function masterReadyAt(step: FakeStep, assetId: string, at = 1): void {
  step.onSleep = (name) => {
    if (name === `source-wait-${at}`) {
      world.fake.readyMaster(assetId);
    }
  };
}

async function jobRow(renderJobId: string) {
  const [row] = await db
    .select()
    .from(renderJob)
    .where(eq(renderJob.id, renderJobId));
  return row;
}

async function sponsorshipOf(sponsorshipId: string) {
  const [row] = await db
    .select()
    .from(sponsorship)
    .where(eq(sponsorship.id, sponsorshipId));
  return row;
}

function emailsTo(addresses: readonly string[]): EmailMessage[] {
  return world.emails.filter((email) => addresses.includes(email.to));
}

async function admins(): Promise<string[]> {
  const created = await Promise.all([makeAdmin(db), makeAdmin(db)]);
  return created.map((admin) => admin.email);
}

/** Expects a clean failure: job failed, `render_failed`, one email per admin. */
async function expectFailed(
  job: Awaited<ReturnType<typeof queuedJob>>,
  addresses: readonly string[],
  code: string
) {
  const stored = await jobRow(job.renderJobId);
  expect(stored?.status).toBe("failed");
  expect(stored?.error?.startsWith(`${code}: `)).toBe(true);
  expect((await sponsorshipOf(job.sponsorshipId))?.status).toBe(
    "render_failed"
  );
  const sent = emailsTo(addresses);
  expect(sent.map((email) => email.to).sort()).toEqual([...addresses].sort());
  expect(sent.every((email) => email.template.endsWith("render-failed"))).toBe(
    true
  );
}

describe("runRenderJob: the happy path (ruling 4)", () => {
  it("renders, waits for the asset and commits: queued → running → succeeded, in_review", async () => {
    const job = await queuedJob({ logo: true });
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    deliverReady(step, job.renderJobId);
    const renderer = puttingRenderer();

    const outcome = await runRenderJob(step, deps({ renderer }), job);

    expect(outcome).toEqual({ outcome: "completed" });
    const stored = await jobRow(job.renderJobId);
    const [upload] = [...world.fake.uploads.values()];
    expect(stored).toMatchObject({
      muxAssetId: upload?.assetId,
      muxUploadId: upload?.id,
      status: "succeeded",
    });
    expect(await sponsorshipOf(job.sponsorshipId)).toMatchObject({
      status: "in_review",
      videoAssetId: upload?.assetId,
      videoPlaybackId: world.fake.assets.get(upload?.assetId as string)
        ?.playbackId,
    });
    // The upload: the passthrough, a dev test upload, the site origin.
    expect(upload).toMatchObject({
      corsOrigin: SITE_URL,
      passthrough: `render-job:${job.renderJobId}`,
      test: true,
    });
    // The renderer got the master, the logo as a data URL and the upload URL.
    const [request] = renderer.requests;
    expect(request?.sourceUrl).toContain("master.fake.mux.com");
    expect(request?.logoDataUrl?.startsWith("data:image/png;base64,")).toBe(
      true
    );
    expect(request?.uploadUrl).toBe(upload?.url);
  });

  it("runs the steps in order, each with its explicit config", async () => {
    const job = await queuedJob({ logo: true });
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId, 2);
    deliverReady(step, job.renderJobId);

    await runRenderJob(step, deps(), job);

    const [uploadId] = [...world.fake.uploads.keys()];
    expect(step.calls.map((call) => call.name)).toEqual([
      "start",
      "source-lookup",
      "source-wait-1",
      "source-poll-1",
      "source-wait-2",
      "source-poll-2",
      "source-resolve",
      "logo",
      "render",
      `ready-${uploadId}`,
      "commit",
    ]);
    const configOf = (name: string) =>
      step.calls.find((call) => call.name === name)?.config;
    expect(configOf("start")).toEqual(RENDER_STEP_CONFIG.start);
    expect(configOf("source-lookup")).toEqual(RENDER_STEP_CONFIG.sourceLookup);
    expect(configOf("source-poll-1")).toEqual(RENDER_STEP_CONFIG.sourcePoll);
    expect(configOf("source-resolve")).toEqual(
      RENDER_STEP_CONFIG.sourceResolve
    );
    expect(configOf("logo")).toEqual(RENDER_STEP_CONFIG.logo);
    expect(configOf("render")).toEqual(RENDER_STEP_CONFIG.render);
    expect(configOf("commit")).toEqual(RENDER_STEP_CONFIG.commit);
    expect(
      step.calls.find((call) => call.name === "source-wait-1")?.timeoutMs
    ).toBe(RENDER_WAITS.sourcePollInterval);
    const wait = step.calls.find((call) => call.kind === "wait");
    expect(wait).toMatchObject({
      timeoutMs: RENDER_WAITS.readyTimeout,
      type: `mux-asset-${uploadId}`,
    });
  });

  it("keeps every step output small and free of signed Mux URLs (I-3)", async () => {
    const job = await queuedJob({ logo: true });
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    deliverReady(step, job.renderJobId);

    await runRenderJob(step, deps(), job);

    const outputs = step.outputs();
    expect(outputs.length).toBeGreaterThan(5);
    for (const output of outputs) {
      const json = JSON.stringify(output) ?? "";
      expect(new TextEncoder().encode(json).byteLength).toBeLessThan(16_384);
      expect(json).not.toMatch(SIGNED_MUX_URL);
    }
    // The pattern itself catches the fake's signed URLs.
    const [upload] = [...world.fake.uploads.values()];
    expect(JSON.stringify({ url: upload?.url })).toMatch(SIGNED_MUX_URL);
  });

  it("a replayed start (its result lost) continues as already-running (B-2)", async () => {
    const job = await queuedJob();
    const step = createFakeStep();
    step.loseResult("start");
    masterReadyAt(step, job.gestureAssetId);
    deliverReady(step, job.renderJobId);

    expect(await runRenderJob(step, deps(), job)).toEqual({
      outcome: "completed",
    });
    expect(step.calls[0]).toMatchObject({ attempts: 2, name: "start" });
    expect(step.calls[0]?.output).toMatchObject({ state: "already-running" });
  });

  it("a final job is a noop: nothing after start", async () => {
    const job = await queuedJob();
    await failRender(db, {
      error: "earlier",
      now: NOW,
      renderJobId: job.renderJobId,
      siteUrl: SITE_URL,
    });
    world.emails.length = 0;
    const step = createFakeStep();
    expect(await runRenderJob(step, deps(), job)).toEqual({ outcome: "noop" });
    expect(step.names()).toEqual(["start"]);
    expect(world.fake.uploads.size).toBe(0);
    expect(
      await runRenderJob(createFakeStep(), deps(), {
        renderJobId: crypto.randomUUID(),
      })
    ).toEqual({ outcome: "noop" });
  });
});

describe("runRenderJob: the source (ruling 4, steps 2–4)", () => {
  it("an unknown playback id uses highest.mp4", async () => {
    const job = await queuedJob();
    world.fake.assets.delete(job.gestureAssetId);
    world.renditions["highest.mp4"] = 200;
    const step = createFakeStep();
    deliverReady(step, job.renderJobId);
    const renderer = puttingRenderer();

    expect(await runRenderJob(step, deps({ renderer }), job)).toEqual({
      outcome: "completed",
    });
    expect(renderer.requests[0]?.sourceUrl).toBe(
      `https://stream.mux.com/${job.playbackId}/highest.mp4`
    );
    expect(step.names()).not.toContain("source-poll-1");
  });

  it("highest.mp4 missing: high.mp4", async () => {
    const job = await queuedJob();
    world.fake.assets.delete(job.gestureAssetId);
    world.renditions["high.mp4"] = 200;
    const step = createFakeStep();
    deliverReady(step, job.renderJobId);
    const renderer = puttingRenderer();

    await runRenderJob(step, deps({ renderer }), job);
    expect(renderer.requests[0]?.sourceUrl).toBe(
      `https://stream.mux.com/${job.playbackId}/high.mp4`
    );
  });

  it("no master and no rendition: sourceUnavailable, failRender and one email per admin", async () => {
    const addresses = await admins();
    const job = await queuedJob();
    world.fake.assets.delete(job.gestureAssetId);
    const step = createFakeStep();
    const renderer = puttingRenderer();

    expect(await runRenderJob(step, deps({ renderer }), job)).toEqual({
      code: "sourceUnavailable",
      outcome: "failed",
    });
    expect(step.names()).toEqual([
      "start",
      "source-lookup",
      "source-resolve",
      "fail",
    ]);
    // Not retried: a non-retryable failure.
    expect(
      step.calls.find((call) => call.name === "source-resolve")?.attempts
    ).toBe(1);
    expect(renderer.requests).toHaveLength(0);
    await expectFailed(job, addresses, "sourceUnavailable");
  });

  it("an errored master ends the polls and falls back to the rendition", async () => {
    const job = await queuedJob();
    world.renditions["highest.mp4"] = 200;
    const step = createFakeStep();
    step.onSleep = (name) => {
      if (name === "source-wait-2") {
        world.fake.errorMaster(job.gestureAssetId);
      }
    };
    deliverReady(step, job.renderJobId);
    const renderer = puttingRenderer();

    expect(await runRenderJob(step, deps({ renderer }), job)).toEqual({
      outcome: "completed",
    });
    expect(step.names()).toContain("source-poll-2");
    expect(step.names()).not.toContain("source-poll-3");
    expect(renderer.requests[0]?.sourceUrl).toContain("highest.mp4");
  });

  it("30 polls without a ready master fall back to the rendition", async () => {
    const job = await queuedJob();
    world.renditions["highest.mp4"] = 200;
    const step = createFakeStep();
    deliverReady(step, job.renderJobId);
    const renderer = puttingRenderer();

    expect(await runRenderJob(step, deps({ renderer }), job)).toEqual({
      outcome: "completed",
    });
    const polls = step.names().filter((name) => name.startsWith("source-poll"));
    expect(polls).toHaveLength(RENDER_WAITS.sourcePolls);
    expect(renderer.requests[0]?.sourceUrl).toContain("highest.mp4");
  });

  it("master access is turned on once, and a ready master needs no poll", async () => {
    const job = await queuedJob();
    world.fake.readyMaster(job.gestureAssetId);
    const step = createFakeStep();
    deliverReady(step, job.renderJobId);

    await runRenderJob(step, deps(), job);
    expect(step.names()).not.toContain("source-poll-1");
    expect(
      world.fake.requests.filter((request) =>
        request.path.endsWith("/master-access")
      )
    ).toHaveLength(0);
  });
});

describe("runRenderJob: the render (ruling 4, step 6)", () => {
  it("a renderer 4xx is not retried: the job fails", async () => {
    const addresses = await admins();
    const job = await queuedJob();
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    const renderer = puttingRenderer(() => ({
      code: "sourceUnreadable",
      message: "no video track",
      ok: false,
    }));

    expect(await runRenderJob(step, deps({ renderer }), job)).toEqual({
      code: "sourceUnreadable",
      outcome: "failed",
    });
    expect(renderer.requests).toHaveLength(1);
    await expectFailed(job, addresses, "sourceUnreadable");
    // The failed job's upload is cancelled.
    const [upload] = [...world.fake.uploads.values()];
    expect(upload?.status).toBe("cancelled");
  });

  it("a source over 120 s is sourceTooLong: final, one attempt (fix wave infra M-3)", async () => {
    const addresses = await admins();
    const job = await queuedJob();
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    const renderer = puttingRenderer(() => ({
      code: "sourceTooLong",
      message: "the source is 150 s long; at most 120 s can be rendered",
      ok: false,
    }));

    expect(await runRenderJob(step, deps({ renderer }), job)).toEqual({
      code: "sourceTooLong",
      outcome: "failed",
    });
    expect(renderer.requests).toHaveLength(1);
    await expectFailed(job, addresses, "sourceTooLong");
  });

  it.each([
    [1, 2],
    [2, 3],
  ])(
    "a 5xx %i time(s), then success: one committed asset, every earlier upload cancelled",
    async (failures, uploads) => {
      const job = await queuedJob();
      const step = createFakeStep();
      masterReadyAt(step, job.gestureAssetId);
      deliverReady(step, job.renderJobId);
      const renderer = puttingRenderer((_, attempt) =>
        attempt <= failures
          ? { code: "renderFailed", message: "chrome crashed", ok: false }
          : FAKE_RENDER_RESULT
      );

      expect(await runRenderJob(step, deps({ renderer }), job)).toEqual({
        outcome: "completed",
      });
      expect(step.calls.find((call) => call.name === "render")?.attempts).toBe(
        failures + 1
      );
      const all = [...world.fake.uploads.values()];
      expect(all).toHaveLength(uploads);
      expect(
        all.slice(0, -1).every((upload) => upload.status === "cancelled")
      ).toBe(true);
      const last = all.at(-1);
      expect((await jobRow(job.renderJobId))?.muxUploadId).toBe(last?.id);
      // Each attempt PUT to its own upload.
      expect(
        new Set(renderer.requests.map((request) => request.uploadUrl)).size
      ).toBe(uploads);
      const renders = [...world.fake.assets.values()].filter((asset) =>
        asset.passthrough?.startsWith("render-job:")
      );
      expect(renders.map((asset) => asset.id)).toEqual([last?.assetId]);
    }
  );

  it("a retry deletes the asset an earlier attempt's upload already made (task 5 I-3)", async () => {
    const job = await queuedJob();
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    deliverReady(step, job.renderJobId);
    let first = true;
    const renderer = createFakeRenderer({
      result: (request) => {
        // Both attempts reach Mux; only the second answers.
        world.fake.completeUpload(uploadIdOf(request.uploadUrl));
        if (first) {
          first = false;
          return { code: "uploadFailed", message: "reset", ok: false };
        }
        return FAKE_RENDER_RESULT;
      },
    });

    await runRenderJob(step, deps({ renderer }), job);
    const renders = [...world.fake.assets.values()].filter((asset) =>
      asset.passthrough?.startsWith("render-job:")
    );
    expect(renders).toHaveLength(1);
    expect(renders[0]?.id).toBe((await jobRow(job.renderJobId))?.muxAssetId);
  });

  it("a network fault is retried, and three are a failure", async () => {
    const addresses = await admins();
    const job = await queuedJob();
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    const renderer = createFakeRenderer({ error: new Error("socket hang up") });

    expect(await runRenderJob(step, deps({ renderer }), job)).toEqual({
      code: "unexpected",
      outcome: "failed",
    });
    expect(renderer.requests).toHaveLength(
      RENDER_STEP_CONFIG.render.retries.limit + 1
    );
    const stored = await jobRow(job.renderJobId);
    expect(stored?.error).toBe("Error: socket hang up");
    expect(emailsTo(addresses)).toHaveLength(2);
  });

  it("a timed-out render attempt is retried", async () => {
    const job = await queuedJob();
    const step = createFakeStep();
    step.forceTimeout("render");
    masterReadyAt(step, job.gestureAssetId);
    deliverReady(step, job.renderJobId);

    expect(await runRenderJob(step, deps(), job)).toEqual({
      outcome: "completed",
    });
    expect(step.calls.find((call) => call.name === "render")?.attempts).toBe(2);
  });

  it("a renderer with no capacity is a wait: slot waits, then the render (fix wave C-1)", async () => {
    const job = await queuedJob();
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    deliverReady(step, job.renderJobId);
    const renderer = puttingRenderer((_, attempt) =>
      attempt <= 3
        ? { code: "busy", message: "no container instance", ok: false }
        : FAKE_RENDER_RESULT
    );

    expect(await runRenderJob(step, deps({ renderer }), job)).toEqual({
      outcome: "completed",
    });
    const [uploadId] = [...world.fake.uploads.keys()].slice(-1);
    expect(step.calls.map((call) => call.name)).toEqual([
      "start",
      "source-lookup",
      "source-wait-1",
      "source-poll-1",
      "source-resolve",
      "render",
      "render-slot-wait-1",
      "render-2",
      "render-slot-wait-2",
      "render-3",
      "render-slot-wait-3",
      "render-4",
      `ready-${uploadId}`,
      "commit",
    ]);
    // A busy attempt uses none of its step's retries.
    for (const name of ["render", "render-2", "render-3", "render-4"]) {
      const call = step.calls.find((entry) => entry.name === name);
      expect(call?.attempts).toBe(1);
      expect(call?.config).toEqual(RENDER_STEP_CONFIG.render);
    }
    expect(
      step.calls.find((call) => call.name === "render-slot-wait-1")?.timeoutMs
    ).toBe(RENDER_WAITS.renderSlotInterval);
    // Each attempt had its own upload; the busy ones are cancelled.
    const all = [...world.fake.uploads.values()];
    expect(all).toHaveLength(4);
    expect(all.slice(0, -1).map((upload) => upload.status)).toEqual([
      "cancelled",
      "cancelled",
      "cancelled",
    ]);
    expect((await jobRow(job.renderJobId))?.status).toBe("succeeded");
  });

  it("no capacity after every slot wait: rendererBusy, failRender and the emails", async () => {
    const addresses = await admins();
    const job = await queuedJob();
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    const renderer = puttingRenderer(() => ({
      code: "busy",
      message: "no container instance",
      ok: false,
    }));

    expect(await runRenderJob(step, deps({ renderer }), job)).toEqual({
      code: "rendererBusy",
      outcome: "failed",
    });
    expect(renderer.requests).toHaveLength(RENDER_WAITS.renderSlotWaits + 1);
    expect(
      step.calls.filter((call) => call.name.startsWith("render-slot-wait-"))
    ).toHaveLength(RENDER_WAITS.renderSlotWaits);
    await expectFailed(job, addresses, "rendererBusy");
    // Every upload, the last one too, is cancelled.
    expect(
      [...world.fake.uploads.values()].every(
        (upload) => upload.status === "cancelled"
      )
    ).toBe(true);
  });

  it("more jobs than renderers: each waits for a free one, and all commit (fix wave C-1)", async () => {
    const CAPACITY = 2;
    const jobs: Awaited<ReturnType<typeof queuedJob>>[] = [];
    for (let i = 0; i < 5; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: fixtures, one checkout each.
      jobs.push(await queuedJob());
    }
    let inFlight = 0;
    let most = 0;
    let busy = 0;
    const renderer: RendererPort = {
      render: async (request) => {
        if (inFlight >= CAPACITY) {
          busy += 1;
          return { code: "busy", message: "no container instance", ok: false };
        }
        inFlight += 1;
        most = Math.max(most, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        world.fake.completeUpload(uploadIdOf(request.uploadUrl));
        inFlight -= 1;
        return FAKE_RENDER_RESULT;
      },
    };
    const steps = jobs.map((job) => {
      const step = createFakeStep();
      step.onSleep = async (name) => {
        if (name === "source-wait-1") {
          world.fake.readyMaster(job.gestureAssetId);
        }
        if (name.startsWith("render-slot-wait-")) {
          // The slot wait passes while the other renders run.
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
      };
      deliverReady(step, job.renderJobId);
      return step;
    });

    const outcomes = await Promise.all(
      jobs.map((job, index) =>
        runRenderJob(steps[index] as FakeStep, deps({ renderer }), job)
      )
    );

    expect(outcomes).toEqual(jobs.map(() => ({ outcome: "completed" })));
    expect(most).toBe(CAPACITY);
    expect(busy).toBeGreaterThan(0);
    expect(steps.some((step) => step.names().includes("render-2"))).toBe(true);
    for (const job of jobs) {
      // biome-ignore lint/performance/noAwaitInLoops: five rows.
      expect((await sponsorshipOf(job.sponsorshipId))?.status).toBe(
        "in_review"
      );
    }
    const renders = [...world.fake.assets.values()].filter((asset) =>
      asset.passthrough?.startsWith("render-job:")
    );
    expect(renders).toHaveLength(jobs.length);
  });

  it("an upload stored by another attempt meanwhile: this one gives way and the retry renders (fix wave M-1)", async () => {
    const job = await queuedJob();
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    deliverReady(step, job.renderJobId);
    let raced = false;
    const mux: Mux = {
      ...world.mux,
      fetch: async (input, init) => {
        const response = await world.mux.fetch(input, init);
        const url = new URL(
          input instanceof Request ? input.url : String(input)
        );
        if (
          !raced &&
          init?.method === "POST" &&
          url.pathname.endsWith("/uploads")
        ) {
          raced = true;
          // A late attempt stores its own upload after this one read the job.
          await db
            .update(renderJob)
            .set({ muxUploadId: "late-attempt-upload" })
            .where(eq(renderJob.id, job.renderJobId));
        }
        return response;
      },
    };

    expect(await runRenderJob(step, deps({ mux }), job)).toEqual({
      outcome: "completed",
    });
    expect(step.calls.find((call) => call.name === "render")?.attempts).toBe(2);
    const [first, second] = [...world.fake.uploads.values()];
    // The attempt that lost the write cancelled its own upload.
    expect(first?.status).toBe("cancelled");
    expect((await jobRow(job.renderJobId))?.muxUploadId).toBe(second?.id);
  });

  it("without Mux: muxUnavailable", async () => {
    const addresses = await admins();
    const job = await queuedJob();
    const step = createFakeStep();
    expect(await runRenderJob(step, deps({ mux: null }), job)).toEqual({
      code: "muxUnavailable",
      outcome: "failed",
    });
    expect(step.names()).toEqual(["start", "source-lookup", "fail"]);
    await expectFailed(job, addresses, "muxUnavailable");
  });

  it("without a renderer: rendererUnavailable, and no upload is created", async () => {
    const addresses = await admins();
    const job = await queuedJob();
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    expect(await runRenderJob(step, deps({ renderer: null }), job)).toEqual({
      code: "rendererUnavailable",
      outcome: "failed",
    });
    expect(world.fake.uploads.size).toBe(0);
    await expectFailed(job, addresses, "rendererUnavailable");
  });

  it("a logo gone from R2: logoMissing", async () => {
    const job = await queuedJob({ logo: true });
    await media().delete(job.logoKey as string);
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    expect(await runRenderJob(step, deps(), job)).toEqual({
      code: "logoMissing",
      outcome: "failed",
    });
  });
});

describe("runRenderJob: the ready wait (ruling 4, step 7)", () => {
  it("no event within the hour: the polls find the asset ready", async () => {
    const job = await queuedJob();
    const step = createFakeStep();
    step.onSleep = (name) => {
      if (name === "source-wait-1") {
        world.fake.readyMaster(job.gestureAssetId);
      }
      if (name === "ready-wait-2") {
        const [upload] = [...world.fake.uploads.values()];
        world.fake.readyAsset(upload?.assetId as string);
      }
    };

    expect(await runRenderJob(step, deps(), job)).toEqual({
      outcome: "completed",
    });
    expect(
      step.names().filter((name) => name.startsWith("ready-poll"))
    ).toEqual(["ready-poll-1", "ready-poll-2"]);
    expect(
      step.calls.find((call) => call.name === "ready-poll-1")?.config
    ).toEqual(RENDER_STEP_CONFIG.readyPoll);
    expect(
      step.calls.find((call) => call.name === "ready-wait-1")?.timeoutMs
    ).toBe(RENDER_WAITS.readyPollInterval);
  });

  it("an asset.errored event: muxAssetErrored with Mux's message", async () => {
    const addresses = await admins();
    const job = await queuedJob();
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    step.onWait = async (type) => {
      const upload = await uploadOfType(type);
      step.sendEvent(type, {
        assetId: upload.assetId ?? undefined,
        error: "Invalid input file",
        renderJobId: job.renderJobId,
        type: "asset.errored",
        uploadId: upload.id,
      } satisfies Partial<RenderMuxEvent>);
    };

    expect(await runRenderJob(step, deps(), job)).toEqual({
      code: "muxAssetErrored",
      outcome: "failed",
    });
    expect((await jobRow(job.renderJobId))?.error).toBe(
      "muxAssetErrored: Invalid input file"
    );
    await expectFailed(job, addresses, "muxAssetErrored");
  });

  it("fail deletes the asset the failed job's upload already made, never the gesture's own (task 5 I-3)", async () => {
    const job = await queuedJob();
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    step.onWait = async (type) => {
      const upload = await uploadOfType(type);
      world.fake.errorAsset(upload.assetId as string, "Invalid input file");
      step.sendEvent(type, {
        assetId: upload.assetId ?? undefined,
        error: "Invalid input file",
        renderJobId: job.renderJobId,
        type: "asset.errored",
        uploadId: upload.id,
      } satisfies Partial<RenderMuxEvent>);
    };

    expect(await runRenderJob(step, deps(), job)).toEqual({
      code: "muxAssetErrored",
      outcome: "failed",
    });
    expect(step.names().at(-1)).toBe("fail");
    const [upload] = [...world.fake.uploads.values()];
    // The upload was past `waiting`: left as it is, its asset deleted.
    expect(upload?.status).toBe("asset_created");
    expect(world.fake.assets.has(upload?.assetId as string)).toBe(false);
    expect(world.fake.assets.has(job.gestureAssetId)).toBe(true);
    expect((await jobRow(job.renderJobId))?.muxUploadId).toBe(upload?.id);
  });

  it("an errored asset found by a poll fails the job", async () => {
    const job = await queuedJob();
    const step = createFakeStep();
    step.onSleep = (name) => {
      if (name === "source-wait-1") {
        world.fake.readyMaster(job.gestureAssetId);
      }
      if (name === "ready-wait-1") {
        const [upload] = [...world.fake.uploads.values()];
        world.fake.errorAsset(upload?.assetId as string, "Corrupt");
      }
    };
    expect(await runRenderJob(step, deps(), job)).toEqual({
      code: "muxAssetErrored",
      outcome: "failed",
    });
  });

  it("15 polls without a ready asset: muxAssetTimeout", async () => {
    const job = await queuedJob();
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    expect(await runRenderJob(step, deps(), job)).toEqual({
      code: "muxAssetTimeout",
      outcome: "failed",
    });
    expect(
      step.names().filter((name) => name.startsWith("ready-poll"))
    ).toHaveLength(RENDER_WAITS.readyPolls);
  });
});

describe("runRenderJob: the commit and its deletes (rulings 4.8 and 13)", () => {
  it("a re-render deletes the previous sponsored asset", async () => {
    const job = await queuedJob({ previous: "asset" });
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    deliverReady(step, job.renderJobId);

    expect(await runRenderJob(step, deps(), job)).toEqual({
      outcome: "completed",
    });
    expect(world.fake.assets.has(job.previousAssetId as string)).toBe(false);
    expect(world.fake.assets.has(job.gestureAssetId)).toBe(true);
  });

  it("never deletes the gesture's own asset, even when it was the sponsorship's video", async () => {
    const job = await queuedJob({ previous: "own" });
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    deliverReady(step, job.renderJobId);

    await runRenderJob(step, deps(), job);
    expect(world.fake.assets.has(job.gestureAssetId)).toBe(true);
    expect(
      world.fake.requests.filter((request) => request.method === "DELETE")
    ).toHaveLength(0);
  });

  it("the sponsorship left rendering before the commit: the new asset is deleted (B-3)", async () => {
    const job = await queuedJob({ previous: "asset" });
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    deliverReady(step, job.renderJobId);
    const deliver = step.onWait;
    step.onWait = async (type) => {
      await db
        .update(sponsorship)
        .set({ status: "cancelled" })
        .where(eq(sponsorship.id, job.sponsorshipId));
      await deliver?.(type);
    };

    expect(await runRenderJob(step, deps(), job)).toEqual({ outcome: "noop" });
    const [upload] = [...world.fake.uploads.values()];
    expect(world.fake.assets.has(upload?.assetId as string)).toBe(false);
    // The previous video stays: the sponsorship still shows it.
    expect(world.fake.assets.has(job.previousAssetId as string)).toBe(true);
  });

  it("the watchdog failed the job first: the new asset is deleted (B-3)", async () => {
    const job = await queuedJob();
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    deliverReady(step, job.renderJobId);
    const deliver = step.onWait;
    step.onWait = async (type) => {
      await failRender(db, {
        error: "timed out",
        now: NOW,
        renderJobId: job.renderJobId,
        siteUrl: SITE_URL,
      });
      await deliver?.(type);
    };

    expect(await runRenderJob(step, deps(), job)).toEqual({ outcome: "noop" });
    const [upload] = [...world.fake.uploads.values()];
    expect(world.fake.assets.has(upload?.assetId as string)).toBe(false);
    // `mux_upload_id` is never cleared: it stays the last upload.
    expect((await jobRow(job.renderJobId))?.muxUploadId).toBe(upload?.id);
  });

  it("a replayed commit (its result lost) keeps the new asset and deletes nothing else", async () => {
    const job = await queuedJob({ previous: "asset" });
    const step = createFakeStep();
    step.loseResult("commit");
    masterReadyAt(step, job.gestureAssetId);
    deliverReady(step, job.renderJobId);

    expect(await runRenderJob(step, deps(), job)).toEqual({
      outcome: "completed",
    });
    expect(step.calls.find((call) => call.name === "commit")?.attempts).toBe(2);
    const stored = await jobRow(job.renderJobId);
    expect(world.fake.assets.has(stored?.muxAssetId as string)).toBe(true);
    expect(world.fake.assets.has(job.gestureAssetId)).toBe(true);
    expect(world.fake.assets.has(job.previousAssetId as string)).toBe(false);
    const deletes = world.fake.requests.filter(
      (request) => request.method === "DELETE"
    );
    // The previous asset, then its replay (a 404, counted as done).
    expect(new Set(deletes.map((request) => request.path))).toEqual(
      new Set([`/video/v1/assets/${job.previousAssetId}`])
    );
  });

  it("a commit cut short after it committed: fail deletes the previous asset, and the outcome is noop (fix wave M-2, M-5)", async () => {
    const addresses = await admins();
    const job = await queuedJob({ previous: "asset" });
    const step = createFakeStep();
    // Every commit attempt commits, then its result is lost; the previous
    // asset's deletes fail meanwhile (Mux down), so only fail can do it.
    step.loseResult("commit", RENDER_STEP_CONFIG.commit.retries.limit + 1);
    masterReadyAt(step, job.gestureAssetId);
    deliverReady(step, job.renderJobId);
    let refusals = RENDER_STEP_CONFIG.commit.retries.limit + 1;
    const mux: Mux = {
      ...world.mux,
      fetch: (input, init) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input)
        );
        if (
          init?.method === "DELETE" &&
          url.pathname.endsWith(`/assets/${job.previousAssetId}`) &&
          refusals > 0
        ) {
          refusals -= 1;
          return Promise.resolve(new Response(null, { status: 503 }));
        }
        return world.mux.fetch(input, init);
      },
    };

    expect(await runRenderJob(step, deps({ mux }), job)).toEqual({
      outcome: "noop",
    });
    expect(step.names()).toContain("fail");
    const stored = await jobRow(job.renderJobId);
    expect(stored?.status).toBe("succeeded");
    expect((await sponsorshipOf(job.sponsorshipId))?.status).toBe("in_review");
    expect(world.fake.assets.has(job.previousAssetId as string)).toBe(false);
    expect(world.fake.assets.has(stored?.muxAssetId as string)).toBe(true);
    expect(world.fake.assets.has(job.gestureAssetId)).toBe(true);
    expect(emailsTo(addresses)).toHaveLength(0);
  });

  it("a whole replay of a finished run runs no step again", async () => {
    const job = await queuedJob();
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    deliverReady(step, job.renderJobId);
    await runRenderJob(step, deps(), job);
    const calls = step.calls.length;
    const requests = world.fake.requests.length;

    expect(await runRenderJob(step, deps(), job)).toEqual({
      outcome: "completed",
    });
    expect(step.calls.length).toBe(calls);
    expect(world.fake.requests.length).toBe(requests);
  });
});

describe("runRenderJob: an engine abort is not a failure (review I-1)", () => {
  const PAUSE = "Aborting engine: User called pause";

  it("a pause during the ready wait is rethrown: no fail step, the job stays running, no email", async () => {
    const addresses = await admins();
    const job = await queuedJob();
    const step = createFakeStep();
    masterReadyAt(step, job.gestureAssetId);
    step.onWait = () => {
      throw new Error(PAUSE);
    };

    await expect(runRenderJob(step, deps(), job)).rejects.toThrow(PAUSE);
    expect(step.names()).not.toContain("fail");
    expect((await jobRow(job.renderJobId))?.status).toBe("running");
    expect((await sponsorshipOf(job.sponsorshipId))?.status).toBe("rendering");
    expect(emailsTo(addresses)).toHaveLength(0);
  });

  it("a pause at a sleep is rethrown too", async () => {
    const job = await queuedJob();
    const step = createFakeStep();
    step.onSleep = () => {
      throw new Error(PAUSE);
    };
    await expect(runRenderJob(step, deps(), job)).rejects.toThrow(PAUSE);
    expect(step.names()).not.toContain("fail");
    expect((await jobRow(job.renderJobId))?.status).toBe("running");
  });
});

describe("runRenderJob: the failure path", () => {
  it("a replayed fail (its result lost) sends no second email", async () => {
    const addresses = await admins();
    const job = await queuedJob();
    world.fake.assets.delete(job.gestureAssetId);
    const step = createFakeStep();
    step.loseResult("fail");

    expect(await runRenderJob(step, deps(), job)).toEqual({
      code: "sourceUnavailable",
      outcome: "failed",
    });
    expect(step.calls.find((call) => call.name === "fail")?.attempts).toBe(2);
    // The same keyed emails twice: the email consumer sends each key once.
    const sent = emailsTo(addresses);
    const keys = new Set(sent.map((email) => email.idempotencyKey));
    expect(keys.size).toBe(addresses.length);
    expect(
      [...keys].every((key) =>
        key?.startsWith(`admin_render_failed:${job.renderJobId}:`)
      )
    ).toBe(true);
  });
});

describe("summariseRenderError and RenderJobFailure", () => {
  it("strips every URL and caps the summary at 300 characters", () => {
    expect(
      summariseRenderError(
        new Error(
          "PUT https://direct-uploads.mux.com/upload/x?signature=abc failed after GET https://master.mux.com/a/master.mp4?token=t"
        )
      )
    ).toBe("Error: PUT [url] failed after GET [url]");
    expect(
      summariseRenderError(
        new RenderJobFailure("logoMissing", "bad data:image/png;base64,AAAA")
      )
    ).toBe("logoMissing: bad [url]");
    expect(summariseRenderError(new Error("x".repeat(1000)))).toHaveLength(300);
    expect(summariseRenderError(null)).toBe("unknown error");
  });

  it("carries its code in the message, so a NonRetryableError or a stored error keeps it", () => {
    const failure = new RenderJobFailure("sourceUnavailable", "no source");
    expect(failure.message).toBe("[render:sourceUnavailable] no source");
    const wrapped = new Error(failure.message);
    wrapped.name = "NonRetryableError";
    expect(toRenderJobFailure(wrapped)).toMatchObject({
      code: "sourceUnavailable",
      detail: "no source",
      retryable: false,
    });
    expect(
      toRenderJobFailure({ message: `NonRetryableError: ${failure.message}` })
        ?.code
    ).toBe("sourceUnavailable");
    expect(
      toRenderJobFailure(
        new Error(
          `Step threw a NonRetryableError with message "${failure.message}"`
        )
      )?.detail
    ).toBe("no source");
    expect(
      nonRetryableMessage(
        new RenderJobFailure(
          "uploadFailed",
          "PUT https://storage.mux.com/up?signature=x failed"
        )
      )
    ).toBe("[render:uploadFailed] PUT [url] failed");
    expect(toRenderJobFailure(new Error("[render:bogus] x"))).toBeNull();
    expect(toRenderJobFailure(new Error("plain"))).toBeNull();
  });
});

describe("the event type and the ceiling", () => {
  it("keeps an alphanumeric upload id and hashes any other", async () => {
    expect(await renderEventType("OA02dANZQXaSYUP4CfBLnb")).toBe(
      "mux-asset-OA02dANZQXaSYUP4CfBLnb"
    );
    for (const odd of ["a.b/c", "x".repeat(200), ""]) {
      // biome-ignore lint/performance/noAwaitInLoops: three values.
      const type = await renderEventType(odd);
      expect(type).toMatch(HASHED_EVENT_TYPE);
      expect(type.length).toBeLessThanOrEqual(100);
    }
  });

  it("RENDER_WATCHDOG_CEILING is above the sum of every step's worst case", () => {
    const { readyPoll, sourcePoll, ...once } = RENDER_STEP_CONFIG;
    const steps =
      Object.values(once).reduce(
        (sum, config) => sum + stepWorstCaseMs(config),
        0
      ) +
      RENDER_WAITS.sourcePolls * stepWorstCaseMs(sourcePoll) +
      // Each slot wait is followed by another `render-<n>` at its worst.
      RENDER_WAITS.renderSlotWaits *
        stepWorstCaseMs(RENDER_STEP_CONFIG.render) +
      RENDER_WAITS.readyPolls * stepWorstCaseMs(readyPoll);
    const waits =
      RENDER_WAITS.readyTimeout +
      RENDER_WAITS.sourcePolls * RENDER_WAITS.sourcePollInterval +
      RENDER_WAITS.renderSlotWaits * RENDER_WAITS.renderSlotInterval +
      RENDER_WAITS.readyPolls * RENDER_WAITS.readyPollInterval;
    expect(steps + waits).toBe(RENDER_WORKFLOW_MAX_MS);
    expect(RENDER_WATCHDOG_CEILING).toBeGreaterThan(steps + waits);
    // Pinned, so a config change shows in review: 5 h 31 min of worst
    // case without a slot wait, plus 12 × (5 min + 63 min) of slot waits
    // and their render attempts: 19 h 07 min, 19 h 37 min with the margin.
    expect(stepWorstCaseMs(RENDER_STEP_CONFIG.render)).toBe(63 * 60_000);
    expect(RENDER_WORKFLOW_MAX_MS).toBe(19_860_000 + 12 * 68 * 60_000);
    expect(RENDER_WATCHDOG_CEILING).toBe((19 * 60 + 37) * 60_000);
    expect(RENDER_WATCHDOG_CEILING).toBeGreaterThan(RENDER_WORKFLOW_MAX_MS);
    // 4 × 1 min + 5 s + 10 s + 20 s (exponential).
    expect(stepWorstCaseMs(RENDER_STEP_CONFIG.sourceLookup)).toBe(
      4 * 60_000 + 70_000
    );
  });
});
