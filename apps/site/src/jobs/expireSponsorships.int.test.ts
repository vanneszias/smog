// @vitest-environment node
import { getPayload } from "payload";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  expireSponsorships,
  failStalledRenders,
  settleComposedVideos,
} from "@/jobs/expireSponsorships";
import { canAdvance, claimRenderJob } from "@/lib/renderState";
import { activeAndInTerm, fetchGestureOverlay } from "@/lib/sponsorOverlay";
import { ALLOWED_TRANSITIONS } from "@/lib/sponsorshipStatus";
import config from "../payload.config";

/*
 * Unique per run: `.wrangler/state/vitest` is persisted and never cleared, and
 * `renders.jobId` refuses duplicates. A collision throws inside `beforeAll`,
 * which Vitest reports as *skipped* rather than failed — a file that looks
 * green having asserted nothing about the mechanism it exists to prove.
 */
const RUN = crypto.randomUUID();

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const PRICE = 5000;

/** A fixed instant, so every date below is arithmetic and not a race. */
const NOW = new Date();

/*
 * Stand-ins, never real credentials, and deliberately not shaped like the real
 * ones. They exist only in this process: `beforeAll` puts them in the
 * environment and `afterAll` takes them out again, which matters because
 * `vitest.config.mts` sets `isolate: false` and every file this worker runs
 * afterwards shares it.
 */
const STUB_MUX_ID = "stub-mux-id-for-tests-only";
const STUB_MUX_SECRET = "stub-mux-secret-for-tests-only";

const ORIGINAL_MUX_ID = process.env.MUX_TOKEN_ID;
const ORIGINAL_MUX_SECRET = process.env.MUX_TOKEN_SECRET;

const MUX_PREFIX = "https://api.mux.com/";

/**
 * Puts a variable back the way it was, including back to *absent*.
 *
 * `process.env.X = undefined` leaves the string `"undefined"` behind rather
 * than unsetting X; `endpoints/render.int.test.ts` documents the hazard at
 * length.
 */
function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];

    return;
  }

  process.env[name] = value;
}

type Status =
  | "active"
  | "cancelled"
  | "expired"
  | "pending_approval"
  | "pending_payment"
  | "pending_resubmission"
  | "rejected";

type RenderState = "failed" | "queued" | "ready" | "rendering" | "uploading";

/**
 * The daily expiry, and the readiness sweep beside it, against a real database
 * with Mux's half of the conversation stubbed at `fetch`.
 *
 * Only `api.mux.com` is intercepted. The D1 emulator behind
 * `getPlatformProxy` talks over `fetch` too, so a blanket stub that answered
 * every request would break the database rather than the video provider.
 *
 * **Both jobs sweep the whole table, which is a property of the jobs rather
 * than of the tests, and it shapes the fake.** The persisted local D1 carries
 * rows from other files and from earlier runs, so the fake answers an asset id
 * it has not been told about as a healthy, deletable asset: a `GET` says it is
 * ready, so the readiness sweep writes nothing about it, and a `DELETE` says
 * `204`. Every assertion below is about this run's own asset ids, so a
 * neighbour's row can neither satisfy nor fail one.
 *
 * **None of this is evidence about Mux.** There are no Mux credentials in this
 * test environment, so what follows proves the shape of the protocol and the
 * order of this application's own steps. The Google strategy's tests are the
 * precedent and the warning.
 */
describe("expiring a sponsorship whose term has ended", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;

  const realFetch = globalThis.fetch;

  /** Every request this file's code made of Mux, in order. */
  let muxCalls: { assetId: string; method: string }[] = [];
  /** Per-asset answers. Anything not named here is healthy and deletable. */
  let muxAnswers = new Map<string, () => Promise<Response>>();

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      status,
    });

  const deletesOf = (id: string) =>
    muxCalls.filter((call) => call.method === "DELETE" && call.assetId === id);

  const seedGesture = async (label: string): Promise<number> => {
    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        isActive: true,
        name: `Vervallen ${label} ${RUN}`,
        playbackId: `pb-original-${label}-${RUN}`,
      },
      locale: "nl",
    });

    return gesture.id;
  };

  const seedSponsorship = async (
    label: string,
    options: {
      endsInDays: number;
      gesture: number;
      preview?: string;
      sponsored?: string;
      status: Status;
    }
  ): Promise<number> => {
    const row = await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Jan Janssens",
        durationYears: 1,
        endDate: new Date(
          NOW.getTime() + options.endsInDays * DAY
        ).toISOString(),
        gesture: options.gesture,
        originalVideoPlaybackId: `pb-original-${label}-${RUN}`,
        overlayText: `Met dank aan ${label}`,
        paymentAmount: PRICE,
        previewVideoPlaybackId: options.preview ?? null,
        sponsorEmail: `expire-${label}-${RUN}@example.com`,
        sponsoredVideoPlaybackId: options.sponsored ?? null,
        sponsorName: `Acme ${label}`,
        startDate: new Date(NOW.getTime() - 365 * DAY).toISOString(),
        status: options.status,
      },
    });

    return row.id;
  };

  /**
   * A render row in a given state holding a given asset.
   *
   * Walked through the state machine rather than written straight in:
   * `collections/Renders.ts` refuses a move `lib/renderState.ts` disallows, so
   * a fixture that set `ready` directly would be testing a row the application
   * cannot produce.
   */
  const seedRender = async (
    label: string,
    sponsorshipId: number,
    options: { assetId: string; playbackId: string; state: RenderState }
  ): Promise<number> => {
    const jobId = `expire-${label}-${RUN}`;
    const claimed = await claimRenderJob(payload, {
      jobId,
      sponsorship: sponsorshipId,
    });

    if (claimed === null) {
      throw new Error(`could not claim ${jobId}`);
    }

    await payload.update({
      collection: "renders",
      data: {
        muxAssetId: options.assetId,
        muxPlaybackId: options.playbackId,
        state: "uploading",
      },
      id: claimed.id,
      overrideAccess: true,
    });

    if (options.state === "ready" || options.state === "failed") {
      await payload.update({
        collection: "renders",
        data: { state: options.state },
        id: claimed.id,
        overrideAccess: true,
      });
    }

    return claimed.id;
  };

  const renderRow = (id: number) =>
    payload.findByID({ collection: "renders", depth: 0, id });

  const sponsorshipRow = (id: number) =>
    payload.findByID({ collection: "sponsorships", depth: 0, id });

  beforeAll(async () => {
    process.env.MUX_TOKEN_ID = STUB_MUX_ID;
    process.env.MUX_TOKEN_SECRET = STUB_MUX_SECRET;

    payload = await getPayload({ config });

    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);

      if (!url.startsWith(MUX_PREFIX)) {
        return realFetch(input as RequestInfo, init);
      }

      const method = init?.method ?? "GET";
      const assetId = url.slice(url.lastIndexOf("/") + 1);

      muxCalls.push({ assetId, method });

      const registered = muxAnswers.get(`${method} ${assetId}`);

      if (registered !== undefined) {
        return registered();
      }

      // A row belonging to another file, or to an earlier run. Healthy and
      // deletable, so neither job writes anything about it.
      return Promise.resolve(
        method === "DELETE"
          ? new Response(null, { status: 204 })
          : jsonResponse({
              data: {
                id: assetId,
                playback_ids: [{ id: `pb-${assetId}`, policy: "public" }],
                status: "ready",
              },
            })
      );
    });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Vervallen ${RUN}` },
      locale: "nl",
    });
    categoryId = category.id;
  });

  beforeEach(() => {
    muxCalls = [];
    muxAnswers = new Map();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    restoreEnv("MUX_TOKEN_ID", ORIGINAL_MUX_ID);
    restoreEnv("MUX_TOKEN_SECRET", ORIGINAL_MUX_SECRET);
  });

  it("boots with the fixtures this file assumes", () => {
    // `beforeAll` throwing is reported as *skipped* rather than failed, so a
    // run that seeded nothing would look green.
    expect(categoryId).toBeGreaterThan(0);
    expect(process.env.MUX_TOKEN_ID).toBe(STUB_MUX_ID);
    // And the two statuses this job will delete an asset for are the two the
    // transition table says nothing comes back from. `rejected` is not one:
    // `rejected -> pending_resubmission` is legal, so a rejected sponsorship's
    // composite can still reach a page.
    expect(
      Object.entries(ALLOWED_TRANSITIONS)
        .filter(([, next]) => next.length === 0)
        .map(([status]) => status)
        .sort()
    ).toEqual(["cancelled", "expired"]);
  });

  it("moves an in-term sponsorship to expired once its end date passes", async () => {
    const gesture = await seedGesture("due");
    const id = await seedSponsorship("due", {
      endsInDays: -1,
      gesture,
      sponsored: `pb-sponsored-due-${RUN}`,
      status: "active",
    });

    const report = await expireSponsorships(payload, NOW);

    expect((await sponsorshipRow(id)).status).toBe("expired");
    expect(report.expired).toBeGreaterThanOrEqual(1);
    expect(report.restoreFailures).toBe(0);
  });

  it("leaves an in-term one alone", async () => {
    const gesture = await seedGesture("interm");
    const id = await seedSponsorship("interm", {
      endsInDays: 30,
      gesture,
      sponsored: `pb-sponsored-interm-${RUN}`,
      status: "active",
    });

    await expireSponsorships(payload, NOW);

    expect((await sponsorshipRow(id)).status).toBe("active");
  });

  it("leaves one alone at the exact instant its term ends", async () => {
    /*
     * The boundary, pinned rather than left to a comment. `activeAndInTerm`
     * treats a sponsorship as in term while `endDate >= now`, so the
     * complement this job applies has to be `endDate < now` exactly — one
     * `less_than_equal` here and there is an instant at which a sponsorship is
     * both drawn on the gesture page and expired by the scheduler.
     */
    const gesture = await seedGesture("boundary");
    const playbackId = `pb-sponsored-boundary-${RUN}`;
    const id = await seedSponsorship("boundary", {
      endsInDays: 0,
      gesture,
      sponsored: playbackId,
      status: "active",
    });

    await expireSponsorships(payload, NOW);

    expect((await sponsorshipRow(id)).status).toBe("active");

    // And the page's own rule, evaluated at the same instant rather than
    // against its own clock, still counts it as running. The two together are
    // the complement: at no instant is a sponsorship both drawn and expired.
    const { docs } = await payload.find({
      collection: "sponsorships",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        and: [{ id: { equals: id } }, ...activeAndInTerm(NOW.toISOString())],
      },
    });

    expect(docs).toHaveLength(1);
    expect(docs[0]?.sponsoredVideoPlaybackId).toBe(playbackId);
  });

  it("restores the gesture's original video before deleting anything", async () => {
    /*
     * The order is the whole test: a Mux asset cannot be un-deleted, so
     * deleting it before the sponsorship has left the page and then failing to
     * move it leaves a gesture playing an asset that no longer exists, with no
     * way back.
     *
     * The proof is taken *inside* the Mux delete rather than after the job:
     * the fake reads the sponsorship out of the database at the instant Mux is
     * asked, so what is asserted is the order of the two steps and not merely
     * their outcome.
     */
    const gesture = await seedGesture("order");
    const assetId = `asset-order-${RUN}`;
    const sponsorshipId = await seedSponsorship("order", {
      endsInDays: -1,
      gesture,
      sponsored: `pb-sponsored-order-${RUN}`,
      status: "active",
    });
    const render = await seedRender("order", sponsorshipId, {
      assetId,
      playbackId: `pb-sponsored-order-${RUN}`,
      state: "ready",
    });

    let statusWhenDeleted = "never asked";

    muxAnswers.set(`DELETE ${assetId}`, async () => {
      statusWhenDeleted = (await sponsorshipRow(sponsorshipId)).status;

      return new Response(null, { status: 204 });
    });

    await expireSponsorships(payload, NOW);

    // The positive first: Mux really was asked, so the assertion below is
    // about an ordering and not about a call that never happened.
    expect(deletesOf(assetId)).toHaveLength(1);
    expect(statusWhenDeleted).toBe("expired");
    expect((await renderRow(render)).muxAssetId ?? null).toBeNull();
  });

  it("does not delete the asset of a sponsorship that is still on the page", async () => {
    /*
     * Where the harm of deleting too early actually lands in this data model.
     * An out-of-term sponsorship has already stopped being drawn —
     * `activeAndInTerm` bounds the term as well as the status — so the row that
     * a mis-scoped guard would destroy is an `active` one whose term is still
     * running, and it would be destroyed by the outstanding-deletion sweep
     * rather than by the due loop.
     *
     * Asserted through `fetchGestureOverlay`, which is what the gesture page
     * calls, so the claim is about what a visitor sees rather than about a
     * column.
     */
    const gesture = await seedGesture("live");
    const assetId = `asset-live-${RUN}`;
    const playbackId = `pb-sponsored-live-${RUN}`;
    const sponsorshipId = await seedSponsorship("live", {
      endsInDays: 30,
      gesture,
      sponsored: playbackId,
      status: "active",
    });
    const render = await seedRender("live", sponsorshipId, {
      assetId,
      playbackId,
      state: "ready",
    });

    expect((await fetchGestureOverlay(gesture))?.sponsoredVideoPlaybackId).toBe(
      playbackId
    );

    await expireSponsorships(payload, NOW);

    expect(deletesOf(assetId)).toHaveLength(0);
    expect((await renderRow(render)).muxAssetId).toBe(assetId);
    // Still playing, and still playing the same thing.
    expect((await fetchGestureOverlay(gesture))?.sponsoredVideoPlaybackId).toBe(
      playbackId
    );
  });

  it("does not delete a rejected sponsorship's asset, because a rejection is not the end", async () => {
    // `rejected -> pending_resubmission -> pending_approval -> active` is a
    // legal path, and `hooks/publishComposedVideo.ts` publishes the composite
    // at the end of it. A hand-written list of "finished" statuses would have
    // had `rejected` in it and the asset would be gone before the approval.
    const gesture = await seedGesture("rejected");
    const assetId = `asset-rejected-${RUN}`;
    const sponsorshipId = await seedSponsorship("rejected", {
      endsInDays: -1,
      gesture,
      preview: `pb-preview-rejected-${RUN}`,
      status: "rejected",
    });
    const render = await seedRender("rejected", sponsorshipId, {
      assetId,
      playbackId: `pb-preview-rejected-${RUN}`,
      state: "ready",
    });

    await expireSponsorships(payload, NOW);

    expect(deletesOf(assetId)).toHaveLength(0);
    expect((await renderRow(render)).muxAssetId).toBe(assetId);
  });

  it("deletes the sponsored Mux asset after the restore succeeds", async () => {
    const gesture = await seedGesture("delete");
    const assetId = `asset-delete-${RUN}`;
    const sponsorshipId = await seedSponsorship("delete", {
      endsInDays: -1,
      gesture,
      sponsored: `pb-sponsored-delete-${RUN}`,
      status: "active",
    });
    const render = await seedRender("delete", sponsorshipId, {
      assetId,
      playbackId: `pb-sponsored-delete-${RUN}`,
      state: "ready",
    });

    const report = await expireSponsorships(payload, NOW);

    expect(deletesOf(assetId)).toHaveLength(1);
    expect(report.assetsDeleted).toBeGreaterThanOrEqual(1);
    expect(report.deleteFailures).toBe(0);
    expect((await renderRow(render)).muxAssetId ?? null).toBeNull();
    // The playback id stays: it is the record of what was shown, and nothing
    // reads it once the sponsorship has left the page.
    expect((await renderRow(render)).muxPlaybackId).toBe(
      `pb-sponsored-delete-${RUN}`
    );
    // And so does the sponsorship's own copy of it. Clearing that would fight
    // `hooks/publishComposedVideo.ts`, which keeps a published composite
    // precisely so a running sponsor's video is never swapped from underneath
    // them, and it is not needed: `fetchGestureOverlay` consults the status.
    expect((await sponsorshipRow(sponsorshipId)).sponsoredVideoPlaybackId).toBe(
      `pb-sponsored-delete-${RUN}`
    );
  });

  it("leaves the asset alone when the restore fails", async () => {
    const gesture = await seedGesture("restorefails");
    const assetId = `asset-restorefails-${RUN}`;
    const sponsorshipId = await seedSponsorship("restorefails", {
      endsInDays: -1,
      gesture,
      sponsored: `pb-sponsored-restorefails-${RUN}`,
      status: "active",
    });
    const render = await seedRender("restorefails", sponsorshipId, {
      assetId,
      playbackId: `pb-sponsored-restorefails-${RUN}`,
      state: "ready",
    });

    const update = payload.update.bind(payload);

    vi.spyOn(payload, "update").mockImplementation(
      (args: Parameters<typeof update>[0]) =>
        args.collection === "sponsorships"
          ? Promise.reject(new Error("D1_ERROR: network is unreachable"))
          : update(args)
    );

    const report = await expireSponsorships(payload, NOW);

    expect(report.restoreFailures).toBeGreaterThanOrEqual(1);
    expect(deletesOf(assetId)).toHaveLength(0);
    expect((await renderRow(render)).muxAssetId).toBe(assetId);
    expect((await sponsorshipRow(sponsorshipId)).status).toBe("active");
  });

  it("does not take the update's word for it that the restore landed", async () => {
    /*
     * The distinguishing test for the guard. An update that changed nothing
     * still answers with a document, so a job that believed its own write
     * would delete the asset out from under a sponsorship that never moved.
     * Here the write is swallowed — it resolves, and the row does not change —
     * and the asset must survive anyway, which is only possible if the
     * decision to delete is taken from the database rather than from the
     * update's answer.
     */
    const gesture = await seedGesture("silent");
    const assetId = `asset-silent-${RUN}`;
    const sponsorshipId = await seedSponsorship("silent", {
      endsInDays: -1,
      gesture,
      sponsored: `pb-sponsored-silent-${RUN}`,
      status: "active",
    });
    const render = await seedRender("silent", sponsorshipId, {
      assetId,
      playbackId: `pb-sponsored-silent-${RUN}`,
      state: "ready",
    });

    const update = payload.update.bind(payload);

    vi.spyOn(payload, "update").mockImplementation(
      async (args: Parameters<typeof update>[0]) =>
        args.collection === "sponsorships"
          ? await sponsorshipRow(sponsorshipId)
          : await update(args)
    );

    const report = await expireSponsorships(payload, NOW);

    // The job thinks it expired it, which is exactly the trap.
    expect(report.expired).toBeGreaterThanOrEqual(1);
    expect((await sponsorshipRow(sponsorshipId)).status).toBe("active");
    expect(deletesOf(assetId)).toHaveLength(0);
    expect((await renderRow(render)).muxAssetId).toBe(assetId);
  });

  it("is idempotent: running twice deletes once", async () => {
    const gesture = await seedGesture("twice");
    const assetId = `asset-twice-${RUN}`;
    const sponsorshipId = await seedSponsorship("twice", {
      endsInDays: -1,
      gesture,
      sponsored: `pb-sponsored-twice-${RUN}`,
      status: "active",
    });
    await seedRender("twice", sponsorshipId, {
      assetId,
      playbackId: `pb-sponsored-twice-${RUN}`,
      state: "ready",
    });

    await expireSponsorships(payload, NOW);
    await expireSponsorships(payload, NOW);

    expect(deletesOf(assetId)).toHaveLength(1);
  });

  it("is stopped the second time by the cleared ledger, not by the status", async () => {
    /*
     * The test above is satisfied by two different mechanisms and cannot say
     * which one acted: the sponsorship is `expired` by then, so the due query
     * no longer returns it, *and* the render row no longer names an asset.
     * This one removes the second mechanism and watches the first fail to
     * stop anything.
     *
     * The asset id is put back on a sponsorship that is still `expired`. If
     * the status were what stopped the second run, nothing would happen; the
     * delete that follows is the positive beside the negative.
     */
    const gesture = await seedGesture("ledger");
    const assetId = `asset-ledger-${RUN}`;
    const sponsorshipId = await seedSponsorship("ledger", {
      endsInDays: -1,
      gesture,
      sponsored: `pb-sponsored-ledger-${RUN}`,
      status: "active",
    });
    const render = await seedRender("ledger", sponsorshipId, {
      assetId,
      playbackId: `pb-sponsored-ledger-${RUN}`,
      state: "ready",
    });

    await expireSponsorships(payload, NOW);
    expect(deletesOf(assetId)).toHaveLength(1);
    expect((await sponsorshipRow(sponsorshipId)).status).toBe("expired");

    await expireSponsorships(payload, NOW);
    expect(deletesOf(assetId)).toHaveLength(1);

    // The ledger back, the status untouched.
    await payload.update({
      collection: "renders",
      data: { muxAssetId: assetId },
      id: render,
      overrideAccess: true,
    });
    expect((await sponsorshipRow(sponsorshipId)).status).toBe("expired");

    await expireSponsorships(payload, NOW);
    expect(deletesOf(assetId)).toHaveLength(2);
  });

  it("finishes a half-run that restored a sponsorship and never deleted its asset", async () => {
    /*
     * The resumability case, and the one no due query can reach: the
     * sponsorship is already `expired`, so nothing looking for `active` rows
     * past their end date will ever see it again. Only the sweep over
     * finished sponsorships finds the asset it left behind.
     */
    const gesture = await seedGesture("halfrun");
    const assetId = `asset-halfrun-${RUN}`;
    const sponsorshipId = await seedSponsorship("halfrun", {
      endsInDays: -1,
      gesture,
      sponsored: `pb-sponsored-halfrun-${RUN}`,
      status: "expired",
    });
    const render = await seedRender("halfrun", sponsorshipId, {
      assetId,
      playbackId: `pb-sponsored-halfrun-${RUN}`,
      state: "ready",
    });

    const report = await expireSponsorships(payload, NOW);

    // Nothing was expired — there was nothing to expire — and the asset went
    // anyway.
    expect(deletesOf(assetId)).toHaveLength(1);
    expect(report.assetsDeleted).toBeGreaterThanOrEqual(1);
    expect((await renderRow(render)).muxAssetId ?? null).toBeNull();
  });

  it("deletes a cancelled sponsorship's asset too", async () => {
    const gesture = await seedGesture("cancelled");
    const assetId = `asset-cancelled-${RUN}`;
    const sponsorshipId = await seedSponsorship("cancelled", {
      endsInDays: 30,
      gesture,
      preview: `pb-preview-cancelled-${RUN}`,
      status: "cancelled",
    });
    const render = await seedRender("cancelled", sponsorshipId, {
      assetId,
      playbackId: `pb-preview-cancelled-${RUN}`,
      state: "ready",
    });

    await expireSponsorships(payload, NOW);

    expect(deletesOf(assetId)).toHaveLength(1);
    expect((await renderRow(render)).muxAssetId ?? null).toBeNull();
  });

  it("deletes the asset of a render whose sponsorship was deleted", async () => {
    /*
     * `collections/Renders.ts` makes `sponsorship` nullable precisely for this
     * — Payload emits `ON DELETE set null`, so deleting a sponsorship strands
     * its render rows — and records that such a row is what a cleanup has left
     * to work from. Nothing can point at the asset, so nothing stops it going.
     */
    const gesture = await seedGesture("orphan");
    const assetId = `asset-orphan-${RUN}`;
    const sponsorshipId = await seedSponsorship("orphan", {
      endsInDays: 30,
      gesture,
      sponsored: `pb-orphan-${RUN}`,
      status: "active",
    });
    const render = await seedRender("orphan", sponsorshipId, {
      assetId,
      playbackId: `pb-orphan-${RUN}`,
      state: "ready",
    });

    await payload.delete({
      collection: "sponsorships",
      id: sponsorshipId,
      overrideAccess: true,
    });

    // `ON DELETE set null` rather than a cascade, which is the whole reason
    // the column is nullable — and the reason the row survives to be swept.
    expect((await renderRow(render)).sponsorship ?? null).toBeNull();

    await expireSponsorships(payload, NOW);

    expect(deletesOf(assetId)).toHaveLength(1);
    expect((await renderRow(render)).muxAssetId ?? null).toBeNull();
  });

  it("reaches an orphaned render the readiness sweep has already settled", async () => {
    /*
     * **The orphan sweep is keyed off the indexed `sponsorship` column now, not
     * filtered out of a page of every render holding an asset.** That filter
     * caused a starvation: with more live assets than fit in one page, an
     * orphan behind them was never in the page to be kept — and an orphan is
     * the one row nobody will ever notice, because it is a bill every month for
     * a video nothing points at.
     *
     * A page of two hundred healthy renders is not a fixture; this asserts the
     * same defect from the other side. The render below is stamped `settledAt`
     * exactly as a healthy live asset is, which takes it out of the readiness
     * sweep's set — so if the orphan sweep still read that same set, this
     * asset would never be deleted. It is a different query, and the row is
     * reached by being an orphan rather than by being recent.
     */
    const gesture = await seedGesture("settled-orphan");
    const assetId = `asset-settled-orphan-${RUN}`;
    const sponsorshipId = await seedSponsorship("settled-orphan", {
      endsInDays: 30,
      gesture,
      sponsored: `pb-settled-orphan-${RUN}`,
      status: "active",
    });
    const render = await seedRender("settled-orphan", sponsorshipId, {
      assetId,
      playbackId: `pb-settled-orphan-${RUN}`,
      state: "ready",
    });

    await payload.update({
      collection: "renders",
      data: { settledAt: new Date().toISOString() },
      id: render,
      overrideAccess: true,
    });
    await payload.delete({
      collection: "sponsorships",
      id: sponsorshipId,
      overrideAccess: true,
    });

    await expireSponsorships(payload, NOW);

    expect(deletesOf(assetId)).toHaveLength(1);
    expect((await renderRow(render)).muxAssetId ?? null).toBeNull();
  });

  it("expires a sponsorship whose Mux asset is already gone", async () => {
    /*
     * A manual deletion, or a previous half-run that deleted the asset and
     * died before recording it. A 404 that read as a failure would pin this
     * sponsorship for ever: every run would ask Mux to delete an asset it does
     * not have, and every run would refuse to clear the ledger.
     */
    const gesture = await seedGesture("gone");
    const assetId = `asset-gone-${RUN}`;
    const sponsorshipId = await seedSponsorship("gone", {
      endsInDays: -1,
      gesture,
      sponsored: `pb-sponsored-gone-${RUN}`,
      status: "active",
    });
    const render = await seedRender("gone", sponsorshipId, {
      assetId,
      playbackId: `pb-sponsored-gone-${RUN}`,
      state: "ready",
    });

    muxAnswers.set(`DELETE ${assetId}`, () =>
      Promise.resolve(
        jsonResponse(
          { error: { messages: ["Asset not found"], type: "not_found" } },
          404
        )
      )
    );

    const report = await expireSponsorships(payload, NOW);

    expect((await sponsorshipRow(sponsorshipId)).status).toBe("expired");
    expect((await renderRow(render)).muxAssetId ?? null).toBeNull();
    expect(report.deleteFailures).toBe(0);
    expect(report.assetsDeleted).toBeGreaterThanOrEqual(1);
  });

  it("keeps the asset recorded when Mux refuses the delete", async () => {
    /*
     * The other half of the 404 rule. A 401 or a 503 says nothing about
     * whether the asset is there, and clearing the ledger on one would leave
     * an asset on Mux that nothing in this application can ever name again.
     */
    const gesture = await seedGesture("refused");
    const assetId = `asset-refused-${RUN}`;
    const sponsorshipId = await seedSponsorship("refused", {
      endsInDays: -1,
      gesture,
      sponsored: `pb-sponsored-refused-${RUN}`,
      status: "active",
    });
    const render = await seedRender("refused", sponsorshipId, {
      assetId,
      playbackId: `pb-sponsored-refused-${RUN}`,
      state: "ready",
    });

    muxAnswers.set(`DELETE ${assetId}`, () =>
      Promise.resolve(
        jsonResponse({ error: { messages: ["Unauthorized"] } }, 401)
      )
    );

    const report = await expireSponsorships(payload, NOW);

    expect(report.deleteFailures).toBeGreaterThanOrEqual(1);
    // Once, not twice. The outstanding-deletion sweep reaches the same
    // sponsorship the due loop just failed on, and asking Mux to do again,
    // seconds later, the thing it has just refused is a second request for
    // nothing against a provider that rate-limits.
    expect(deletesOf(assetId)).toHaveLength(1);
    // The sponsorship still moved: the restore is not held hostage by Mux.
    expect((await sponsorshipRow(sponsorshipId)).status).toBe("expired");
    // And the asset is still named, so tomorrow's run tries again.
    expect((await renderRow(render)).muxAssetId).toBe(assetId);
  });

  it("carries on after one sponsorship's asset cannot be deleted", async () => {
    const gestureA = await seedGesture("batch-a");
    const gestureB = await seedGesture("batch-b");
    const assetA = `asset-batch-a-${RUN}`;
    const assetB = `asset-batch-b-${RUN}`;
    const first = await seedSponsorship("batch-a", {
      endsInDays: -1,
      gesture: gestureA,
      sponsored: `pb-sponsored-batch-a-${RUN}`,
      status: "active",
    });
    const second = await seedSponsorship("batch-b", {
      endsInDays: -1,
      gesture: gestureB,
      sponsored: `pb-sponsored-batch-b-${RUN}`,
      status: "active",
    });

    await seedRender("batch-a", first, {
      assetId: assetA,
      playbackId: `pb-sponsored-batch-a-${RUN}`,
      state: "ready",
    });
    await seedRender("batch-b", second, {
      assetId: assetB,
      playbackId: `pb-sponsored-batch-b-${RUN}`,
      state: "ready",
    });

    muxAnswers.set(`DELETE ${assetA}`, () =>
      Promise.reject(new Error("connection reset"))
    );

    await expireSponsorships(payload, NOW);

    expect((await sponsorshipRow(first)).status).toBe("expired");
    expect((await sponsorshipRow(second)).status).toBe("expired");
    expect(deletesOf(assetB)).toHaveLength(1);
  });

  it("never asks Mux about a render that holds no asset", async () => {
    const gesture = await seedGesture("noasset");
    const sponsorshipId = await seedSponsorship("noasset", {
      endsInDays: -1,
      gesture,
      status: "active",
    });
    const jobId = `expire-noasset-${RUN}`;

    await claimRenderJob(payload, { jobId, sponsorship: sponsorshipId });

    // And a row whose column is present but empty, which `exists: true` in the
    // sweep's filter counts as an asset and a URL would carry as a trailing
    // slash — `DELETE /video/v1/assets/` is a request to delete nothing, or
    // everything, depending on the provider.
    const blank = await seedRender("blank", sponsorshipId, {
      assetId: "",
      playbackId: `pb-blank-${RUN}`,
      state: "ready",
    });

    expect((await renderRow(blank)).muxAssetId).toBe("");

    await expireSponsorships(payload, NOW);

    expect((await sponsorshipRow(sponsorshipId)).status).toBe("expired");
    expect(muxCalls.some((call) => call.assetId === "")).toBe(false);
    expect(muxCalls.some((call) => call.assetId === "assets")).toBe(false);
  });
});

/*
 * ---------------------------------------------------------------------------
 * Failure mode: Mux accepts the upload and then fails to process it
 * ---------------------------------------------------------------------------
 */

describe("a composed video Mux never made ready", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;

  const realFetch = globalThis.fetch;

  let muxCalls: { assetId: string; method: string }[] = [];
  let muxAnswers = new Map<string, () => Promise<Response>>();

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      status,
    });

  /**
   * An asset Mux took and then could not prepare.
   *
   * **It still carries its public playback id, and that detail is the test.**
   * Mux mints the playback ids when the asset is created, long before ingest
   * finishes, so an asset that fails afterwards is `errored` *with* an id that
   * plays nothing. A fixture answering `playback_ids: []` would let the
   * missing-id check stand in for the `errored` check, and the mutation that
   * deletes the latter survived this whole file until that was corrected —
   * one guard masked by another, the same way a mutation survived in the
   * render callback's tests.
   */
  const erroredAsset = (assetId: string) =>
    jsonResponse({
      data: {
        id: assetId,
        playback_ids: [{ id: `pb-${assetId}`, policy: "public" }],
        status: "errored",
      },
    });

  const seedGesture = async (label: string): Promise<number> => {
    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        isActive: true,
        name: `Onspeelbaar ${label} ${RUN}`,
        playbackId: `pb-settle-original-${label}-${RUN}`,
      },
      locale: "nl",
    });

    return gesture.id;
  };

  const seedSponsorship = async (
    label: string,
    options: { gesture: number; preview?: string; status: Status }
  ): Promise<number> => {
    const row = await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Jan Janssens",
        durationYears: 1,
        endDate: new Date(NOW.getTime() + 365 * DAY).toISOString(),
        gesture: options.gesture,
        originalVideoPlaybackId: `pb-settle-original-${label}-${RUN}`,
        overlayText: `Met dank aan ${label}`,
        paymentAmount: PRICE,
        previewVideoPlaybackId: options.preview ?? null,
        sponsorEmail: `settle-${label}-${RUN}@example.com`,
        sponsorName: `Acme ${label}`,
        startDate: new Date(NOW.getTime() - DAY).toISOString(),
        status: options.status,
      },
    });

    return row.id;
  };

  const seedRender = async (
    label: string,
    sponsorshipId: number,
    options: { assetId: string; playbackId: string; state: RenderState }
  ): Promise<number> => {
    const jobId = `settle-${label}-${RUN}`;
    const claimed = await claimRenderJob(payload, {
      jobId,
      sponsorship: sponsorshipId,
    });

    if (claimed === null) {
      throw new Error(`could not claim ${jobId}`);
    }

    await payload.update({
      collection: "renders",
      data: {
        muxAssetId: options.assetId,
        muxPlaybackId: options.playbackId,
        state: "uploading",
      },
      id: claimed.id,
      overrideAccess: true,
    });

    if (options.state === "ready") {
      await payload.update({
        collection: "renders",
        data: { state: "ready" },
        id: claimed.id,
        overrideAccess: true,
      });
    }

    return claimed.id;
  };

  const renderRow = (id: number) =>
    payload.findByID({ collection: "renders", depth: 0, id });

  const sponsorshipRow = (id: number) =>
    payload.findByID({ collection: "sponsorships", depth: 0, id });

  beforeAll(async () => {
    process.env.MUX_TOKEN_ID = STUB_MUX_ID;
    process.env.MUX_TOKEN_SECRET = STUB_MUX_SECRET;

    payload = await getPayload({ config });

    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);

      if (!url.startsWith(MUX_PREFIX)) {
        return realFetch(input as RequestInfo, init);
      }

      const method = init?.method ?? "GET";
      const assetId = url.slice(url.lastIndexOf("/") + 1);

      muxCalls.push({ assetId, method });

      const registered = muxAnswers.get(`${method} ${assetId}`);

      if (registered !== undefined) {
        return registered();
      }

      return Promise.resolve(
        method === "DELETE"
          ? new Response(null, { status: 204 })
          : jsonResponse({
              data: {
                id: assetId,
                playback_ids: [{ id: `pb-${assetId}`, policy: "public" }],
                status: "ready",
              },
            })
      );
    });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Onspeelbaar ${RUN}` },
      locale: "nl",
    });
    categoryId = category.id;
  });

  beforeEach(() => {
    muxCalls = [];
    muxAnswers = new Map();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    restoreEnv("MUX_TOKEN_ID", ORIGINAL_MUX_ID);
    restoreEnv("MUX_TOKEN_SECRET", ORIGINAL_MUX_SECRET);
  });

  it("boots with the fixtures this file assumes", () => {
    expect(categoryId).toBeGreaterThan(0);
    // The reason a `ready` render cannot be marked failed, pinned rather than
    // described: `lib/renderState.ts` gives it no outgoing edge, and the
    // callback marks a render ready the moment Mux accepts the asset.
    expect(canAdvance("ready", "failed")).toBe(false);
    expect(canAdvance("uploading", "failed")).toBe(true);
  });

  it("marks a render failed when Mux reports the asset errored", async () => {
    /*
     * A render still `uploading` is what a crash between the Mux create and
     * the render update leaves behind, and it is the state in which the table
     * still allows the move. The reason names the asset verbatim, because the
     * ledger is cleared in the same write and this line becomes the only
     * record of the id.
     */
    const gesture = await seedGesture("errored");
    const assetId = `asset-settle-errored-${RUN}`;
    const sponsorshipId = await seedSponsorship("errored", {
      gesture,
      preview: `pb-settle-errored-${RUN}`,
      status: "pending_approval",
    });
    const render = await seedRender("errored", sponsorshipId, {
      assetId,
      playbackId: `pb-settle-errored-${RUN}`,
      state: "uploading",
    });

    muxAnswers.set(`GET ${assetId}`, () =>
      Promise.resolve(erroredAsset(assetId))
    );

    const report = await settleComposedVideos(payload);

    const row = await renderRow(render);
    expect(row.state).toBe("failed");
    expect(row.failureReason ?? "").toContain(assetId);
    expect(row.failureReason ?? "").toContain("errored");
    expect(row.muxAssetId ?? null).toBeNull();
    expect(report.unplayable).toBeGreaterThanOrEqual(1);
  });

  it("does not point a sponsorship at an asset that never became ready", async () => {
    /*
     * The whole of this failure mode, asserted through the approval that would
     * publish it. `hooks/publishComposedVideo.ts` copies
     * `previewVideoPlaybackId` to the column the public gesture page reads the
     * moment an administrator approves, and nothing at that moment asks Mux
     * anything — so if the composite is dead, this sweep is the only thing
     * between it and a dead player.
     *
     * The second sponsorship is the positive beside the negative: identical in
     * every respect except that Mux says its asset is fine, and its approval
     * does publish. Without it, a hook that had simply stopped publishing
     * anything at all would pass.
     */
    const deadGesture = await seedGesture("dead");
    const liveGesture = await seedGesture("alive");
    const deadAsset = `asset-settle-dead-${RUN}`;
    const liveAsset = `asset-settle-alive-${RUN}`;
    const deadPlayback = `pb-settle-dead-${RUN}`;
    const livePlayback = `pb-settle-alive-${RUN}`;

    const dead = await seedSponsorship("dead", {
      gesture: deadGesture,
      preview: deadPlayback,
      status: "pending_approval",
    });
    const alive = await seedSponsorship("alive", {
      gesture: liveGesture,
      preview: livePlayback,
      status: "pending_approval",
    });

    await seedRender("dead", dead, {
      assetId: deadAsset,
      playbackId: deadPlayback,
      state: "ready",
    });
    await seedRender("alive", alive, {
      assetId: liveAsset,
      playbackId: livePlayback,
      state: "ready",
    });

    muxAnswers.set(`GET ${deadAsset}`, () =>
      Promise.resolve(erroredAsset(deadAsset))
    );

    await settleComposedVideos(payload);

    expect(
      (await sponsorshipRow(dead)).previewVideoPlaybackId ?? null
    ).toBeNull();
    expect((await sponsorshipRow(alive)).previewVideoPlaybackId).toBe(
      livePlayback
    );

    for (const id of [dead, alive]) {
      await payload.update({
        collection: "sponsorships",
        data: { status: "active" },
        id,
        overrideAccess: true,
      });
    }

    expect(
      (await sponsorshipRow(dead)).sponsoredVideoPlaybackId ?? null
    ).toBeNull();
    expect((await sponsorshipRow(alive)).sponsoredVideoPlaybackId).toBe(
      livePlayback
    );
  });

  it("clears the sponsorship before it records the render", async () => {
    /*
     * The order inside the write pair, for the same reason as the order
     * outside: until the sponsorship's column is cleared, an administrator
     * approving in that instant publishes the dead composite. Recording the
     * render first and dying would leave exactly that window open for ever,
     * because the ledger is cleared in the same write and no later run would
     * ever look at the asset again.
     */
    const gesture = await seedGesture("writeorder");
    const assetId = `asset-settle-writeorder-${RUN}`;
    const playbackId = `pb-settle-writeorder-${RUN}`;
    const sponsorshipId = await seedSponsorship("writeorder", {
      gesture,
      preview: playbackId,
      status: "pending_approval",
    });

    await seedRender("writeorder", sponsorshipId, {
      assetId,
      playbackId,
      state: "ready",
    });

    muxAnswers.set(`GET ${assetId}`, () =>
      Promise.resolve(erroredAsset(assetId))
    );

    const update = payload.update.bind(payload);
    const written: string[] = [];

    vi.spyOn(payload, "update").mockImplementation(
      (args: Parameters<typeof update>[0]) => {
        written.push(args.collection);

        return update(args);
      }
    );

    await settleComposedVideos(payload);
    vi.restoreAllMocks();

    // The positive first, so the ordering below is an ordering of writes that
    // really happened rather than of an empty list.
    expect(written).toContain("sponsorships");
    expect(written).toContain("renders");
    expect(written.indexOf("sponsorships")).toBeLessThan(
      written.indexOf("renders")
    );
  });

  it("records the reason on a render the state table will not let it fail", async () => {
    /*
     * "Marks a render failed when Mux reports the asset errored" cannot hold
     * without qualification: for a render the callback has already marked
     * `ready` that is not possible: `ready` has no outgoing edge, on purpose,
     * because re-opening a finished render would let a second callback
     * overwrite its Mux ids. The reason is recorded anyway, because a
     * `failureReason` beside a `ready` state is the honest description of what
     * happened.
     */
    const gesture = await seedGesture("terminal");
    const assetId = `asset-settle-terminal-${RUN}`;
    const sponsorshipId = await seedSponsorship("terminal", {
      gesture,
      preview: `pb-settle-terminal-${RUN}`,
      status: "pending_approval",
    });
    const render = await seedRender("terminal", sponsorshipId, {
      assetId,
      playbackId: `pb-settle-terminal-${RUN}`,
      state: "ready",
    });

    muxAnswers.set(`GET ${assetId}`, () =>
      Promise.resolve(erroredAsset(assetId))
    );

    await settleComposedVideos(payload);

    const row = await renderRow(render);
    expect(row.state).toBe("ready");
    expect(row.failureReason ?? "").toContain(assetId);
    expect(row.muxAssetId ?? null).toBeNull();
  });

  it("treats an asset Mux no longer has as one that will never play", async () => {
    const gesture = await seedGesture("vanished");
    const assetId = `asset-settle-vanished-${RUN}`;
    const sponsorshipId = await seedSponsorship("vanished", {
      gesture,
      preview: `pb-settle-vanished-${RUN}`,
      status: "pending_approval",
    });
    const render = await seedRender("vanished", sponsorshipId, {
      assetId,
      playbackId: `pb-settle-vanished-${RUN}`,
      state: "ready",
    });

    muxAnswers.set(`GET ${assetId}`, () =>
      Promise.resolve(
        jsonResponse(
          { error: { messages: ["Asset not found"], type: "not_found" } },
          404
        )
      )
    );

    await settleComposedVideos(payload);

    expect(
      (await sponsorshipRow(sponsorshipId)).previewVideoPlaybackId ?? null
    ).toBeNull();
    expect((await renderRow(render)).failureReason ?? "").toContain(
      "no longer has"
    );
  });

  it("treats an asset with no public playback id as one that will never play", async () => {
    const gesture = await seedGesture("signed");
    const assetId = `asset-settle-signed-${RUN}`;
    const sponsorshipId = await seedSponsorship("signed", {
      gesture,
      preview: `pb-settle-signed-${RUN}`,
      status: "pending_approval",
    });
    const render = await seedRender("signed", sponsorshipId, {
      assetId,
      playbackId: `pb-settle-signed-${RUN}`,
      state: "ready",
    });

    muxAnswers.set(`GET ${assetId}`, () =>
      Promise.resolve(
        jsonResponse({
          data: {
            id: assetId,
            playback_ids: [{ id: "pbSignedOnly", policy: "signed" }],
            status: "ready",
          },
        })
      )
    );

    await settleComposedVideos(payload);

    expect(
      (await sponsorshipRow(sponsorshipId)).previewVideoPlaybackId ?? null
    ).toBeNull();
    expect((await renderRow(render)).muxAssetId ?? null).toBeNull();
  });

  it("reads the readiness sweep off an index, not a scan", async () => {
    /*
     * **The sweep could starve.** It read every render still holding a
     * `muxAssetId`, newest first, capped at one page — so the set it read was
     * the product's whole history of healthy live assets, and once that passed
     * a page an older render sat behind every newer one and was never asked
     * about again.
     *
     * The fix is a column the sweep writes, so the set drains. The assertion
     * is in two parts because the two halves fail differently:
     *
     * - **structural**: the candidate query filters on `settledAt`. A sweep
     *   that stamped the column and then ignored it would pass every
     *   behavioural assertion in this file and starve exactly as before, and
     *   two hundred renders is not a fixture.
     * - **behavioural**: a render Mux has called `ready` is never asked about
     *   again. That is what makes the set finite — and it is asserted through
     *   `muxCalls`, so it is about a request that is not made rather than
     *   about a column that is set.
     */
    const gesture = await seedGesture("settled");
    const assetId = `asset-settle-settled-${RUN}`;
    const playbackId = `pb-settle-settled-${RUN}`;
    const sponsorshipId = await seedSponsorship("settled", {
      gesture,
      preview: playbackId,
      status: "pending_approval",
    });
    const render = await seedRender("settled", sponsorshipId, {
      assetId,
      playbackId,
      state: "ready",
    });

    const realFind = payload.find.bind(payload);
    const renderQueries: unknown[] = [];

    payload.find = (async (args: Parameters<typeof payload.find>[0]) => {
      if (args.collection === "renders") {
        renderQueries.push({ sort: args.sort, where: args.where });
      }

      return await realFind(args);
    }) as typeof payload.find;

    let first: Awaited<ReturnType<typeof settleComposedVideos>>;

    try {
      first = await settleComposedVideos(payload);
    } finally {
      payload.find = realFind;
    }

    // The candidate query, not one of the per-render reads: it is the one that
    // names `muxAssetId`, and it must also name `settledAt`.
    const candidate = renderQueries.find((query) =>
      JSON.stringify(query).includes("muxAssetId")
    );

    expect(JSON.stringify(candidate)).toContain("settledAt");
    expect((candidate as { sort?: string } | undefined)?.sort).toBe(
      "createdAt"
    );

    expect(first.settled).toBeGreaterThanOrEqual(1);
    expect((await renderRow(render)).settledAt).toBeTruthy();
    expect(muxCalls.filter((call) => call.assetId === assetId)).toHaveLength(1);

    // And the second sweep does not ask again. This is the whole of "cannot
    // starve": the set the sweep reads is the work outstanding rather than
    // everything that has ever happened.
    muxCalls = [];
    await settleComposedVideos(payload);

    expect(muxCalls.filter((call) => call.assetId === assetId)).toEqual([]);
  });

  it("does not settle an asset that is only preparing", async () => {
    /*
     * The guard inside the fix, and the one that would undo the sweep if it
     * were wrong. `preparing` is not a verdict — it is the ordinary answer
     * minutes after a callback, and the asset may still go `errored`. Settling
     * it would take it out of the candidate set on the strength of an answer
     * that has not been given, and the composite that then died would sit in
     * `previewVideoPlaybackId` waiting for an administrator to publish a video
     * that does not exist. That is the failure this entire sweep exists to
     * prevent.
     */
    const gesture = await seedGesture("unsettled");
    const assetId = `asset-settle-unsettled-${RUN}`;
    const playbackId = `pb-settle-unsettled-${RUN}`;
    const sponsorshipId = await seedSponsorship("unsettled", {
      gesture,
      preview: playbackId,
      status: "pending_approval",
    });
    const render = await seedRender("unsettled", sponsorshipId, {
      assetId,
      playbackId,
      state: "ready",
    });

    muxAnswers.set(`GET ${assetId}`, () =>
      Promise.resolve(
        jsonResponse({
          data: {
            id: assetId,
            playback_ids: [{ id: playbackId, policy: "public" }],
            status: "preparing",
          },
        })
      )
    );

    await settleComposedVideos(payload);

    expect((await renderRow(render)).settledAt ?? null).toBeNull();

    // And the next sweep does ask again, which is the point of not settling
    // it: the answer that matters has not been given yet.
    muxCalls = [];
    muxAnswers = new Map();
    await settleComposedVideos(payload);

    expect(muxCalls.filter((call) => call.assetId === assetId)).toHaveLength(1);
    expect((await renderRow(render)).settledAt).toBeTruthy();
  });

  it("leaves a composite that is still preparing exactly where it is", async () => {
    /*
     * `preparing` is the normal answer minutes after a callback, and it is not
     * a verdict. Acting on it would throw away every composite the sweep
     * happened to run beside.
     */
    const gesture = await seedGesture("preparing");
    const assetId = `asset-settle-preparing-${RUN}`;
    const playbackId = `pb-settle-preparing-${RUN}`;
    const sponsorshipId = await seedSponsorship("preparing", {
      gesture,
      preview: playbackId,
      status: "pending_approval",
    });
    const render = await seedRender("preparing", sponsorshipId, {
      assetId,
      playbackId,
      state: "ready",
    });

    muxAnswers.set(`GET ${assetId}`, () =>
      Promise.resolve(
        jsonResponse({
          data: {
            id: assetId,
            playback_ids: [{ id: playbackId, policy: "public" }],
            status: "preparing",
          },
        })
      )
    );

    const report = await settleComposedVideos(payload);

    expect(report.unplayable).toBe(0);
    expect((await sponsorshipRow(sponsorshipId)).previewVideoPlaybackId).toBe(
      playbackId
    );
    expect((await renderRow(render)).muxAssetId).toBe(assetId);
  });

  it("leaves everything exactly as it was when Mux cannot be asked", async () => {
    /*
     * An outage is not a verdict either, and this is the direction that costs
     * money in the wrong hands: a 503 read as "the asset is gone" would clear
     * the ledger for an asset still on Mux and still billed for, and throw
     * away a composite that plays.
     */
    const gesture = await seedGesture("outage");
    const assetId = `asset-settle-outage-${RUN}`;
    const playbackId = `pb-settle-outage-${RUN}`;
    const sponsorshipId = await seedSponsorship("outage", {
      gesture,
      preview: playbackId,
      status: "pending_approval",
    });
    const render = await seedRender("outage", sponsorshipId, {
      assetId,
      playbackId,
      state: "ready",
    });

    muxAnswers.set(`GET ${assetId}`, () =>
      Promise.resolve(
        jsonResponse({ error: { messages: ["Service unavailable"] } }, 503)
      )
    );

    const report = await settleComposedVideos(payload);

    expect(report.unreadable).toBeGreaterThanOrEqual(1);
    expect((await sponsorshipRow(sponsorshipId)).previewVideoPlaybackId).toBe(
      playbackId
    );
    expect((await renderRow(render)).muxAssetId).toBe(assetId);
    expect((await renderRow(render)).failureReason ?? null).toBeNull();
  });

  it("counts a timed-out Mux read as unreadable and leaves the render pending, as any other Mux failure", async () => {
    /*
     * A timeout is `fetch` rejecting with an `AbortError` / `TimeoutError`,
     * which is not distinguished from any other failure to reach Mux —
     * `readMuxAsset` lets it propagate, and this sweep must treat it exactly as
     * it treats the 503 case above: the render is left pending for the next
     * sweep, not marked failed.
     */
    const gesture = await seedGesture("timeout");
    const assetId = `asset-settle-timeout-${RUN}`;
    const playbackId = `pb-settle-timeout-${RUN}`;
    const sponsorshipId = await seedSponsorship("timeout", {
      gesture,
      preview: playbackId,
      status: "pending_approval",
    });
    const render = await seedRender("timeout", sponsorshipId, {
      assetId,
      playbackId,
      state: "ready",
    });

    muxAnswers.set(`GET ${assetId}`, () =>
      Promise.reject(
        new DOMException("The operation timed out.", "TimeoutError")
      )
    );

    const report = await settleComposedVideos(payload);

    expect(report.unreadable).toBeGreaterThanOrEqual(1);
    expect((await sponsorshipRow(sponsorshipId)).previewVideoPlaybackId).toBe(
      playbackId
    );
    expect((await renderRow(render)).muxAssetId).toBe(assetId);
    expect((await renderRow(render)).failureReason ?? null).toBeNull();
  });

  it("leaves the composite of a different render alone", async () => {
    /*
     * A sponsorship can have more than one render — a re-render is a new job
     * id — and only one of them is the composite it is holding. Clearing the
     * column because some *other* render's asset died would throw away a
     * working video.
     */
    const gesture = await seedGesture("other");
    const deadAsset = `asset-settle-other-${RUN}`;
    const held = `pb-settle-held-${RUN}`;
    const sponsorshipId = await seedSponsorship("other", {
      gesture,
      preview: held,
      status: "pending_approval",
    });
    const render = await seedRender("other", sponsorshipId, {
      assetId: deadAsset,
      playbackId: `pb-settle-other-${RUN}`,
      state: "ready",
    });

    muxAnswers.set(`GET ${deadAsset}`, () =>
      Promise.resolve(erroredAsset(deadAsset))
    );

    await settleComposedVideos(payload);

    // The dead render is recorded...
    expect((await renderRow(render)).failureReason ?? "").toContain(deadAsset);
    // ...and the composite the sponsorship is actually holding is untouched.
    expect((await sponsorshipRow(sponsorshipId)).previewVideoPlaybackId).toBe(
      held
    );
  });

  it("does not ask Mux about an asset that is about to be deleted anyway", async () => {
    // A finished sponsorship is `expireSponsorships`'s business. Asking
    // whether its asset is playable is a request for an answer nobody acts on,
    // and Mux rate-limits.
    const gesture = await seedGesture("finished");
    const assetId = `asset-settle-finished-${RUN}`;
    const sponsorshipId = await seedSponsorship("finished", {
      gesture,
      preview: `pb-settle-finished-${RUN}`,
      status: "expired",
    });

    await seedRender("finished", sponsorshipId, {
      assetId,
      playbackId: `pb-settle-finished-${RUN}`,
      state: "ready",
    });

    await settleComposedVideos(payload);

    expect(muxCalls.filter((call) => call.assetId === assetId)).toHaveLength(0);
  });
});

/*
 * ---------------------------------------------------------------------------
 * Failure mode: a callback that never arrives at all
 * ---------------------------------------------------------------------------
 */

describe("a render whose Lambda callback never arrived, or whose Mux upload never finished", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;

  const hoursAgo = (hours: number) =>
    new Date(NOW.getTime() - hours * HOUR).toISOString();

  const seedGesture = async (label: string): Promise<number> => {
    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        isActive: true,
        name: `Vastgelopen ${label} ${RUN}`,
        playbackId: `pb-stalled-original-${label}-${RUN}`,
      },
      locale: "nl",
    });

    return gesture.id;
  };

  const seedSponsorship = async (label: string): Promise<number> => {
    const gesture = await seedGesture(label);
    const previewVideoPlaybackId = `pb-stalled-preview-${label}-${RUN}`;
    const row = await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Jan Janssens",
        durationYears: 1,
        endDate: new Date(NOW.getTime() + 365 * DAY).toISOString(),
        gesture,
        originalVideoPlaybackId: `pb-stalled-original-${label}-${RUN}`,
        overlayText: `Met dank aan ${label}`,
        paymentAmount: PRICE,
        previewVideoPlaybackId,
        sponsorEmail: `stalled-${label}-${RUN}@example.com`,
        sponsorName: `Acme ${label}`,
        startDate: new Date(NOW.getTime() - DAY).toISOString(),
        status: "pending_approval",
      },
    });

    return row.id;
  };

  /**
   * Walks a freshly claimed render through the state table to `state`, then
   * backdates `createdAt`/`updatedAt` straight into the row.
   *
   * The two steps cannot be merged. Every ordinary write through the Local
   * API — including the ones this helper itself makes to reach `state` —
   * re-stamps `updatedAt` with the real clock
   * (`collections/operations/utilities/update.js`), so the backdating has to
   * be the very last thing that touches the row and has to go beneath that
   * layer: `payload.db.updateOne` writes the columns directly, the same way
   * `jobs/reapStrandedJobs.int.test.ts`'s `forceRow` does.
   */
  const seedStalledRender = async (
    label: string,
    sponsorshipId: number,
    options: {
      createdAt: string;
      state: "queued" | "ready" | "rendering" | "uploading";
      updatedAt?: string;
    }
  ): Promise<number> => {
    const jobId = `stalled-${label}-${RUN}`;
    const claimed = await claimRenderJob(payload, {
      jobId,
      sponsorship: sponsorshipId,
    });

    if (claimed === null) {
      throw new Error(`could not claim ${jobId}`);
    }

    const steps =
      options.state === "ready"
        ? (["uploading", "ready"] as const)
        : options.state === "queued"
          ? []
          : ([options.state] as const);

    for (const state of steps) {
      await payload.update({
        collection: "renders",
        data: { state },
        id: claimed.id,
        overrideAccess: true,
      });
    }

    await payload.db.updateOne({
      collection: "renders",
      data: {
        createdAt: options.createdAt,
        ...(options.updatedAt ? { updatedAt: options.updatedAt } : {}),
      },
      id: claimed.id,
    });

    return claimed.id;
  };

  const renderRow = (id: number) =>
    payload.findByID({ collection: "renders", depth: 0, id });

  const sponsorshipRow = (id: number) =>
    payload.findByID({ collection: "sponsorships", depth: 0, id });

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Vastgelopen ${RUN}` },
      locale: "nl",
    });
    categoryId = category.id;
  });

  it("boots with the fixtures this file assumes", () => {
    expect(categoryId).toBeGreaterThan(0);
  });

  it("fails a queued render whose claim is seven hours old", async () => {
    const sponsorshipId = await seedSponsorship("queued-old");
    const render = await seedStalledRender("queued-old", sponsorshipId, {
      createdAt: hoursAgo(7),
      state: "queued",
    });

    const report = await failStalledRenders(payload, NOW);

    const row = await renderRow(render);
    expect(row.state).toBe("failed");
    expect(row.failureReason).toBe("Remotion Lambda never reported back");
    expect(report.failed).toBeGreaterThanOrEqual(1);
  });

  it("leaves a five-hour-old queued render alone", async () => {
    const sponsorshipId = await seedSponsorship("queued-fresh");
    const render = await seedStalledRender("queued-fresh", sponsorshipId, {
      createdAt: hoursAgo(5),
      state: "queued",
    });

    await failStalledRenders(payload, NOW);

    const row = await renderRow(render);
    expect(row.state).toBe("queued");
    expect(row.failureReason ?? null).toBeNull();
  });

  it("fails a rendering render whose claim is seven hours old", async () => {
    // The render submission's ambiguous-start case: the claim is kept so a late
    // webhook can still settle it, and this sweep is what eventually gives up
    // on it.
    const sponsorshipId = await seedSponsorship("rendering-old");
    const render = await seedStalledRender("rendering-old", sponsorshipId, {
      createdAt: hoursAgo(7),
      state: "rendering",
    });

    await failStalledRenders(payload, NOW);

    const row = await renderRow(render);
    expect(row.state).toBe("failed");
    expect(row.failureReason).toBe("Remotion Lambda never reported back");
  });

  it("leaves a ready render alone no matter how old its claim is", async () => {
    const sponsorshipId = await seedSponsorship("ready-old");
    const render = await seedStalledRender("ready-old", sponsorshipId, {
      createdAt: hoursAgo(400),
      state: "ready",
    });

    await failStalledRenders(payload, NOW);

    const row = await renderRow(render);
    expect(row.state).toBe("ready");
    expect(row.failureReason ?? null).toBeNull();
  });

  it("fails an uploading render six hours after it entered that state", async () => {
    // Remotion's webhook delivery times out after 10s and is retried at most
    // twice (about 1s and then 2s later); a Mux upload slower than that can
    // leave nothing to settle a row stuck here.
    const sponsorshipId = await seedSponsorship("uploading-old");
    const render = await seedStalledRender("uploading-old", sponsorshipId, {
      createdAt: hoursAgo(9),
      state: "uploading",
      updatedAt: hoursAgo(7),
    });

    const report = await failStalledRenders(payload, NOW);

    const row = await renderRow(render);
    expect(row.state).toBe("failed");
    expect(row.failureReason).toBe("The upload to Mux never finished");
    expect(report.failed).toBeGreaterThanOrEqual(1);
  });

  it("leaves an uploading render alone before six hours have passed since it entered that state", async () => {
    // Claimed long ago, but only recently moved into `uploading` — what
    // matters is time in *this* state, not time since the original claim.
    const sponsorshipId = await seedSponsorship("uploading-fresh");
    const render = await seedStalledRender("uploading-fresh", sponsorshipId, {
      createdAt: hoursAgo(9),
      state: "uploading",
      updatedAt: hoursAgo(5),
    });

    await failStalledRenders(payload, NOW);

    const row = await renderRow(render);
    expect(row.state).toBe("uploading");
    expect(row.failureReason ?? null).toBeNull();
  });

  it("leaves a queued render alone at exactly six hours since its claim", async () => {
    // The cutoff is strict: `createdAt < now - 6 h`. A row claimed at the
    // cutoff instant is not yet stalled.
    const sponsorshipId = await seedSponsorship("queued-boundary");
    const render = await seedStalledRender("queued-boundary", sponsorshipId, {
      createdAt: hoursAgo(6),
      state: "queued",
    });

    await failStalledRenders(payload, NOW);

    const row = await renderRow(render);
    expect(row.state).toBe("queued");
    expect(row.failureReason ?? null).toBeNull();
  });

  it("leaves an uploading render alone at exactly six hours since it entered that state", async () => {
    // The same strict cutoff, on `updatedAt`.
    const sponsorshipId = await seedSponsorship("uploading-boundary");
    const render = await seedStalledRender(
      "uploading-boundary",
      sponsorshipId,
      {
        createdAt: hoursAgo(9),
        state: "uploading",
        updatedAt: hoursAgo(6),
      }
    );

    await failStalledRenders(payload, NOW);

    const row = await renderRow(render);
    expect(row.state).toBe("uploading");
    expect(row.failureReason ?? null).toBeNull();
  });

  it("keeps whatever preview the sponsorship has; it is untouched", async () => {
    const sponsorshipId = await seedSponsorship("preview-kept");
    const before = await sponsorshipRow(sponsorshipId);
    const render = await seedStalledRender("preview-kept", sponsorshipId, {
      createdAt: hoursAgo(7),
      state: "queued",
    });

    await failStalledRenders(payload, NOW);

    expect((await renderRow(render)).state).toBe("failed");
    expect((await sponsorshipRow(sponsorshipId)).previewVideoPlaybackId).toBe(
      before.previewVideoPlaybackId
    );
    expect((await sponsorshipRow(sponsorshipId)).status).toBe(before.status);
  });
});
