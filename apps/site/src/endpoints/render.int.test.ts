// @vitest-environment node
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getPayload, handleEndpoints } from "payload";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  RENDER_SIGNATURE_SCHEME,
  signRenderCallback,
} from "@/lib/renderSignature";
import { canAdvance, claimRenderJob } from "@/lib/renderState";
import nextConfig from "../../next.config";
import { failStalledRenders } from "../jobs/expireSponsorships";
import config from "../payload.config";

/*
 * Unique per run: the local D1 under `.wrangler/state/vitest` is never cleared
 * between runs, and a collision on `jobId` — the one column in either claim
 * table that refuses duplicates — throws inside `beforeAll`, which Vitest
 * reports as *skipped* rather than failed. The file would look green having
 * asserted nothing about the mechanism it exists to prove.
 */
const RUN = crypto.randomUUID();

const SITE = "http://localhost:3003";
const CALLBACK_PATH = "/api/render/callback";
const SIGNATURE_HEADER = "x-remotion-signature";
const DAY = 24 * 60 * 60 * 1000;
const PRICE = 5000;

/*
 * Stand-ins, never real credentials, and deliberately not shaped like the real
 * ones — a Mux token id is a UUID and its secret a long base64 string, and a
 * callback secret is 32 random bytes — so a secret scanner has nothing to
 * flag. They exist only in this process: `beforeAll` puts them in the
 * environment and `afterAll` takes them out again, which matters more than it
 * used to now that `isolate: false` shares one process across files.
 */
const STUB_SECRET = "stub-render-secret-for-tests-only";
const STUB_MUX_ID = "stub-mux-id-for-tests-only";
const STUB_MUX_SECRET = "stub-mux-secret-for-tests-only";

const ORIGINAL_CALLBACK_SECRET = process.env.RENDER_CALLBACK_SECRET;
const ORIGINAL_MUX_ID = process.env.MUX_TOKEN_ID;
const ORIGINAL_MUX_SECRET = process.env.MUX_TOKEN_SECRET;

const MUX_PREFIX = "https://api.mux.com/";

/**
 * The signature Remotion Lambda puts on a webhook, as
 * `@remotion/serverless@4.0.484` computes it (`dist/invoke-webhook.js`,
 * `calculateSignature`): `sha512=` and the hex HMAC-SHA-512 of the posted
 * bytes, in `X-Remotion-Signature`. `node:crypto`, as Remotion writes it,
 * rather than the Web Crypto code under test — so every delivery below is
 * signed by an implementation the handler does not share.
 */
function remotionSignature(body: string, secret: string): string {
  return `sha512=${createHmac("sha512", secret).update(body).digest("hex")}`;
}

/**
 * The scheme this application verified before it adopted Remotion's, for the
 * test that proves it is no longer accepted.
 */
const LEGACY_SHA256_SCHEME = {
  algorithm: "SHA-256",
  header: "x-render-signature",
  prefix: "",
} as const;

/**
 * Puts a variable back the way it was, including back to *absent*.
 *
 * `process.env.X = undefined` does not unset X — Node coerces the value and
 * leaves the string `"undefined"` behind. That is ordinarily harmless, and
 * `vitest.config.mts` now sets `isolate: false`, so every file this worker
 * runs afterwards shares this process: a leftover
 * `RENDER_CALLBACK_SECRET="undefined"` would make a future file's callback
 * verifiable under a secret nobody chose. `mollie.int.test.ts` restores its own
 * key with a plain assignment and has the same latent leak; it is harmless
 * there today because nothing else reads that variable, which is a property of
 * the current suite rather than of the code.
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

/**
 * `POST /api/render/callback`, driven through `handleEndpoints` against a real
 * database, with Mux's half of the conversation stubbed at `fetch`.
 *
 * `handleEndpoints` rather than the handler directly, for the reason
 * `mollie.int.test.ts` gives: half of what can go wrong is routing, and a
 * handler called with a hand-built `req` passes whatever path it is mounted
 * at. It also means every request here arrives with **no `Origin` header and
 * no session**, which is what a real Lambda callback looks like — so the fact
 * that the signature is the whole of the authentication is exercised rather
 * than asserted.
 *
 * Only `api.mux.com` is intercepted. The D1 emulator behind
 * `getPlatformProxy` talks over `fetch` too, so a blanket `vi.stubGlobal` that
 * answered every request would break the database rather than the video
 * provider.
 *
 * **None of this is evidence about Mux.** There are no Mux credentials in this
 * project, so everything below is a fake that answers the shape of the
 * protocol. Stage 4's Google strategy is the precedent and the warning: a fake
 * proves a shape and never a provider's behaviour.
 */
describe("the render callback", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let gestureId: number;

  const realFetch = globalThis.fetch;

  /** Every Mux asset creation this test's code caused. */
  let muxUploads: { body: string; url: string }[] = [];
  /** What the next `POST /video/v1/assets` answers. Reset per test. */
  let muxWillAnswer: () => Promise<Response> = () =>
    Promise.reject(new Error("no Mux answer registered"));

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      status,
    });

  /** Mux's answer to a create, with ids unique per call. */
  const muxCreatesAnAsset = (
    overrides: {
      playbackIds?: { id: string; policy: string }[];
      status?: string;
    } = {}
  ) => {
    muxWillAnswer = () => {
      // The request is recorded before the answer is built, so the call being
      // answered is the last one in the list rather than the next one.
      const serial = muxUploads.length - 1;

      return Promise.resolve(
        jsonResponse({
          data: {
            id: `asset-${RUN}-${serial}`,
            playback_ids: overrides.playbackIds ?? [
              { id: `pb-${RUN}-${serial}`, policy: "public" },
            ],
            status: overrides.status ?? "preparing",
          },
        })
      );
    };
  };

  /** A job id no other test in this file, or run, uses. */
  const jobId = (label: string) => `render-cb-${label}-${RUN}`;

  const seedSponsorship = async (
    label: string,
    status: Status
  ): Promise<number> => {
    const now = Date.now();
    const row = await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Jan Janssens",
        durationYears: 1,
        endDate: new Date(now + 365 * DAY).toISOString(),
        gesture: gestureId,
        originalVideoPlaybackId: `pb-cb-${RUN}`,
        overlayText: `Met dank aan ${label}`,
        paymentAmount: PRICE,
        sponsorEmail: `cb-${label}-${RUN}@example.com`,
        sponsorName: `Acme ${label}`,
        startDate: new Date(now).toISOString(),
        status,
      },
    });

    return row.id;
  };

  /**
   * A sponsorship and a `queued` render row for it, exactly as the paid
   * Mollie webhook leaves them (`lib/paidRenders.ts`): the submitter owns the
   * `renders` row, which is the whole reason the callback needs a claim of
   * its own.
   */
  const seedJob = async (
    label: string,
    status: Status = "pending_approval"
  ): Promise<{ id: string; sponsorship: number }> => {
    const sponsorship = await seedSponsorship(label, status);
    const id = jobId(label);

    await claimRenderJob(payload, { jobId: id, sponsorship });

    return { id, sponsorship };
  };

  /**
   * Remotion's own id for the render behind job `id`: deliberately a
   * different string, so a handler that settled by `renderId` instead of by
   * `customData.jobId` finds no row and every test below notices.
   */
  const remotionRenderIdOf = (id: string) => `rr-${id}`;

  /**
   * What Remotion Lambda posts about job `id`, in the shape and key order
   * `@remotion/serverless@4.0.484`'s `dist/handlers/launch.js` builds: its own
   * `renderId`, the bucket, and `customData` echoed from the submission —
   * which is where our job id travels. `fields` are the per-type ones:
   * `outputUrl` and friends on a success, `errors` on an error, none on a
   * timeout.
   */
  const lambdaReport = (
    id: string,
    type: "error" | "success" | "timeout",
    fields: Record<string, unknown> = {}
  ) => ({
    type,
    renderId: remotionRenderIdOf(id),
    expectedBucketOwner: "123456789012",
    bucketName: "remotionlambda-eucentral1-test",
    customData: { jobId: id },
    ...fields,
  });

  /** What Remotion Lambda posts when a render finishes. */
  const successReport = (id: string) => {
    const outputUrl = `https://remotionlambda-test.s3.amazonaws.com/renders/${remotionRenderIdOf(id)}/out.mp4`;

    return {
      ...lambdaReport(id, "success"),
      outputUrl,
      lambdaErrors: [],
      outputFile: outputUrl,
      timeToFinish: 41_234,
      costs: { accruedSoFar: 0.0123, currency: "USD" },
    };
  };

  /**
   * One callback, exactly as Lambda makes it: a JSON body, an HMAC over those
   * bytes, no `Origin` and no session.
   *
   * `signWith` and `header` are separate knobs on purpose. The first makes a
   * signature that is real but under the wrong secret; the second replaces or
   * removes the header outright. A test that could only do one of them would
   * not be able to tell "the signature is wrong" from "there is no signature".
   */
  const deliver = async (
    report: unknown,
    options: { header?: null | string; signWith?: string } = {}
  ) => {
    const body = JSON.stringify(report);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const signature =
      options.header === undefined
        ? remotionSignature(body, options.signWith ?? STUB_SECRET)
        : options.header;

    if (signature !== null) {
      headers[SIGNATURE_HEADER] = signature;
    }

    return await handleEndpoints({
      config,
      request: new Request(`${SITE}${CALLBACK_PATH}`, {
        body,
        headers,
        method: "POST",
      }),
    });
  };

  /** Everything about a response a caller can see. */
  const snapshot = async (response: Response) => ({
    body: await response.text(),
    headers: [...response.headers.entries()].sort(),
    status: response.status,
  });

  const renderRow = async (id: string) => {
    const { docs } = await payload.find({
      collection: "renders",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { jobId: { equals: id } },
    });

    return docs[0];
  };

  /**
   * The completion claim, looked up by the key `lib/claims.ts` actually stores.
   *
   * Namespaced by kind, and spelled out here rather than imported: the whole
   * point of the namespace is that a Remotion job id and a Mollie payment id
   * cannot shadow each other, and a helper shared with the code under test
   * would agree with whatever that code did.
   */
  const completionsFor = async (id: string) => {
    const { totalDocs } = await payload.find({
      collection: "claims",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { key: { equals: `render-completion:${id}` } },
    });

    return totalDocs;
  };

  const sponsorship = (id: number) =>
    payload.findByID({ collection: "sponsorships", depth: 0, id });

  beforeAll(async () => {
    process.env.RENDER_CALLBACK_SECRET = STUB_SECRET;
    process.env.MUX_TOKEN_ID = STUB_MUX_ID;
    process.env.MUX_TOKEN_SECRET = STUB_MUX_SECRET;

    payload = await getPayload({ config });

    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);

      if (!url.startsWith(MUX_PREFIX)) {
        return realFetch(input as RequestInfo, init);
      }

      muxUploads.push({ body: String(init?.body ?? ""), url });

      return muxWillAnswer();
    });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Callback ${RUN}` },
      locale: "nl",
    });

    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive: true,
        name: `Renderen ${RUN}`,
        playbackId: `pb-cb-${RUN}`,
      },
      locale: "nl",
    });
    gestureId = gesture.id;
  });

  beforeEach(() => {
    muxUploads = [];
    muxCreatesAnAsset();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    restoreEnv("RENDER_CALLBACK_SECRET", ORIGINAL_CALLBACK_SECRET);
    restoreEnv("MUX_TOKEN_ID", ORIGINAL_MUX_ID);
    restoreEnv("MUX_TOKEN_SECRET", ORIGINAL_MUX_SECRET);
  });

  it("boots with the fixtures this file assumes", () => {
    // `beforeAll` throwing is reported as *skipped*, not failed, so a run that
    // seeded nothing would look green. This turns that into a named failure.
    expect(gestureId).toBeGreaterThan(0);
    expect(process.env.RENDER_CALLBACK_SECRET).toBe(STUB_SECRET);
    expect(process.env.MUX_TOKEN_ID).toBe(STUB_MUX_ID);
    // The header every delivery below puts the signature in is the one the
    // handler reads, and it reads it from the scheme constant rather than from
    // a string of its own — so changing the scheme moves both together.
    expect(RENDER_SIGNATURE_SCHEME.header).toBe(SIGNATURE_HEADER);
  });

  it("is reachable at the path next.config.ts rewrites /render/callback to", async () => {
    // The URL in this line is one Remotion holds: a render submission hands
    // it over in the start payload and Lambda posts back to whatever it was
    // given, minutes later and on
    // retries, for jobs submitted before any deploy. Deleting the rewrite does
    // not fail a handler test — the handler is still mounted — it just makes
    // every callback a 404 and every composed video one nobody uploads.
    const rewrites = await nextConfig.rewrites?.();
    const entries = Array.isArray(rewrites)
      ? rewrites
      : (rewrites?.afterFiles ?? []);

    expect(entries).toContainEqual({
      destination: CALLBACK_PATH,
      source: "/render/callback",
    });

    // And the destination really resolves to this handler, rather than to a
    // path that merely looks right.
    const { id } = await seedJob("rewrite");

    expect((await deliver(successReport(id))).status).toBe(200);
    expect(muxUploads).toHaveLength(1);
  });

  it("advances the render and stores the Mux ids", async () => {
    const { id, sponsorship: sponsorshipId } = await seedJob("happy");

    const response = await deliver(successReport(id));

    expect(response.status).toBe(200);

    const row = await renderRow(id);
    expect(row?.state).toBe("ready");
    expect(row?.muxAssetId).toBe(`asset-${RUN}-0`);
    expect(row?.muxPlaybackId).toBe(`pb-${RUN}-0`);

    // Exactly one asset, and it was made from the output Lambda named.
    expect(muxUploads).toHaveLength(1);
    expect(muxUploads[0]?.url).toBe("https://api.mux.com/video/v1/assets");
    // `passthrough` names the render row — an id, never anything about the
    // sponsor — so an asset can be traced back from Mux's dashboard.
    expect(JSON.parse(muxUploads[0]?.body ?? "{}")).toEqual({
      input: [{ url: successReport(id).outputUrl }],
      passthrough: `render:${row?.id}`,
      playback_policy: ["public"],
    });

    // And the sponsorship now holds the composed video. `overrideAccess: false`
    // on that write fails here: `sponsorships.update` is `isAdmin` and this
    // request has no user at all.
    const after = await sponsorship(sponsorshipId);
    expect(after.previewVideoPlaybackId).toBe(`pb-${RUN}-0`);
    // But not the column the public gesture page reads. That copy is made when
    // an administrator approves, so no callback can reach a public page
    // without a person in between.
    expect(after.sponsoredVideoPlaybackId ?? null).toBeNull();
  });

  it("refuses an unsigned body", async () => {
    const { id, sponsorship: sponsorshipId } = await seedJob("unsigned");

    const absent = await deliver(successReport(id), { header: null });
    expect(absent.status).toBe(401);

    const empty = await deliver(successReport(id), { header: "" });
    expect(empty.status).toBe(401);

    // Nothing happened, and nothing was claimed — so the signed delivery below
    // is not turned away as a replay of an attack.
    expect(muxUploads).toEqual([]);
    expect((await renderRow(id))?.state).toBe("queued");
    expect(await completionsFor(id)).toBe(0);

    // The positive beside the negative: the same bytes, signed, do go through.
    // Without this the refusals above would also pass against a handler that
    // refused everything.
    expect((await deliver(successReport(id))).status).toBe(200);
    expect(muxUploads).toHaveLength(1);
    expect((await sponsorship(sponsorshipId)).previewVideoPlaybackId).toBe(
      `pb-${RUN}-0`
    );
  });

  it("refuses a signature over a different body", async () => {
    const { id } = await seedJob("swapped");
    const other = await seedJob("swapped-other");

    // A signature this application really produced, over a body it really
    // sent — just not this one. That is the replay an attacker has: one
    // observed callback, re-posted with the job id changed.
    const stolen = remotionSignature(
      JSON.stringify(successReport(other.id)),
      STUB_SECRET
    );

    const response = await deliver(successReport(id), { header: stolen });

    expect(response.status).toBe(401);
    expect(muxUploads).toEqual([]);
    expect((await renderRow(id))?.state).toBe("queued");
  });

  it("refuses a signature of the right shape but the wrong secret", async () => {
    // Priced so that only the secret can refuse it: the same body, the same
    // header shape, the same everything but the key.
    const { id } = await seedJob("wrong-secret");

    const response = await deliver(successReport(id), {
      signWith: `${STUB_SECRET}-but-not-quite`,
    });

    expect(response.status).toBe(401);
    expect(muxUploads).toEqual([]);
  });

  it("is idempotent: the same callback twice uploads to Mux once", async () => {
    /*
     * Sequential, and **three things stop the second one**: the handler sees
     * the render is already `ready` and ignores the callback before claiming
     * anything; the completion claim would short-circuit it after that; and
     * the render state table would refuse it anyway — `ready` has no outgoing
     * edges, so `ready -> uploading` is not a legal move. So this test is not
     * proof of the claim on its own. The two below are: the concurrent case,
     * where both callbacks read the row as `queued` and neither the state
     * check nor the state table can tell them apart; and the isolation test,
     * which puts the row back in `queued` so the claim is the only thing left
     * standing.
     */
    const { id } = await seedJob("replayed");

    await deliver(successReport(id));
    await deliver(successReport(id));

    expect(muxUploads).toHaveLength(1);
    expect((await renderRow(id))?.muxAssetId).toBe(`asset-${RUN}-0`);
  });

  it("answers 200 to a replay, so Lambda stops retrying", async () => {
    // Whole responses, not status codes: Remotion's `invokeWebhook` retries
    // on any non-2xx, and a body or a header that differs is a different
    // answer to the same question.
    const { id } = await seedJob("replay-200");

    const first = await snapshot(await deliver(successReport(id)));
    const second = await snapshot(await deliver(successReport(id)));

    expect(second).toEqual(first);
    expect(second.status).toBe(200);
  });

  it("survives two concurrent callbacks for one job", async () => {
    /*
     * The one the `render-completions` claim exists for, and the assertion
     * that matters is the Mux call count rather than the row state: an
     * orphaned Mux asset is a monthly bill for ever, and the render row looks
     * identical whether one asset or two were made.
     *
     * Both callbacks read the render row as `queued` — with no transactions,
     * the two reads happen before either write — so `canAdvance` allows both
     * and the render state table cannot be what serialises them. Nor can
     * `enforceStatusTransitions`: this handler makes no status transition at
     * all (see the test that proves it below). The claim is the only
     * candidate, which is why removing it is the mutation this test must fail
     * on.
     */
    expect(canAdvance("queued", "uploading")).toBe(true);

    const { id } = await seedJob("concurrent");

    const [first, second] = await Promise.all([
      deliver(successReport(id)),
      deliver(successReport(id)),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(muxUploads).toHaveLength(1);
    expect((await renderRow(id))?.muxAssetId).toBe(`asset-${RUN}-0`);
    expect(await completionsFor(id)).toBe(1);
  });

  it("is stopped by the completion claim and not by the render state table", async () => {
    /*
     * The distinguishing test. `it("is idempotent")` above is satisfied by two
     * different mechanisms and cannot say which one acted; this one removes
     * the other mechanism and watches what happens.
     *
     * After the first callback the render row is `ready`, and `ready ->
     * uploading` is refused by `lib/renderState.ts`. So the row is put back to
     * `queued`, where the move is legal again — and the replay still uploads
     * nothing. Then the claim is handed back, and the very same callback
     * uploads. That last step is the positive beside the negative: without it,
     * a handler that refused every replay for any reason at all would pass.
     */
    expect(canAdvance("ready", "uploading")).toBe(false);
    expect(canAdvance("queued", "uploading")).toBe(true);

    const { id, sponsorship: sponsorshipId } = await seedJob("isolated");

    await deliver(successReport(id));
    expect(muxUploads).toHaveLength(1);

    // Back to `queued`, by replacing the row rather than updating it: the
    // state table refuses `ready -> queued` too, which is the point.
    await payload.delete({
      collection: "renders",
      overrideAccess: true,
      where: { jobId: { equals: id } },
    });
    await claimRenderJob(payload, { jobId: id, sponsorship: sponsorshipId });
    expect((await renderRow(id))?.state).toBe("queued");

    expect((await deliver(successReport(id))).status).toBe(200);
    expect(muxUploads).toHaveLength(1);

    await payload.delete({
      collection: "claims",
      overrideAccess: true,
      where: { key: { equals: `render-completion:${id}` } },
    });

    expect((await deliver(successReport(id))).status).toBe(200);
    expect(muxUploads).toHaveLength(2);
  });

  it("ignores a callback that arrives after the stalled-render sweep failed the render", async () => {
    /*
     * The sweep gives up on a render six hours after its claim; Remotion can
     * still deliver after that (a render that ran long, a delivery retried).
     * The render is already an answer — `failed` has no outgoing edge — so
     * the callback must not take the completion claim, must not ask Mux for
     * an asset nothing could ever record, and must answer as a settled
     * decision rather than a 500 Lambda would retry.
     */
    const { id } = await seedJob("after-sweep");
    const row = await renderRow(id);

    // Seven hours old, beneath the layer that re-stamps timestamps, the way
    // `expireSponsorships.int.test.ts` backdates its stalled renders.
    await payload.db.updateOne({
      collection: "renders",
      data: {
        createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      },
      id: row?.id as number,
    });
    await failStalledRenders(payload, new Date());
    expect((await renderRow(id))?.state).toBe("failed");

    const info = vi.spyOn(payload.logger, "info");
    let response: Response;
    let logged: string[] = [];

    try {
      response = await deliver(successReport(id));
    } finally {
      logged = info.mock.calls.map((call) => String(call[0]));
      info.mockRestore();
    }

    expect(await snapshot(response)).toEqual({
      body: '{"status":"ok"}',
      headers: expect.any(Array),
      status: 200,
    });
    expect(await completionsFor(id)).toBe(0);
    expect(muxUploads).toEqual([]);
    expect((await renderRow(id))?.state).toBe("failed");
    expect(logged).toContain(
      `[render] Ignored a callback for render ${id}, already failed`
    );
  });

  it("ignores a callback for a render that is already ready, before taking any claim", async () => {
    const { id } = await seedJob("already-ready");

    await deliver(successReport(id));
    expect((await renderRow(id))?.state).toBe("ready");

    // The claim the first callback took is handed back by hand, so that only
    // the state check is left to stop the second one.
    await payload.delete({
      collection: "claims",
      overrideAccess: true,
      where: { key: { equals: `render-completion:${id}` } },
    });

    expect((await deliver(successReport(id))).status).toBe(200);
    expect(muxUploads).toHaveLength(1);
    expect(await completionsFor(id)).toBe(0);
  });

  it("answers a non-2xx when the completion claim cannot be taken at all", async () => {
    /*
     * A create can fail because another callback already holds the claim, and
     * it can fail because the database is unreachable. Treating the second as
     * the first would answer 200 to a render nothing was done about, Lambda
     * would stop retrying, and a composite somebody paid minutes of Lambda
     * time for would be gone. So the claim confirms a failure by reading the
     * row back, and rethrows when it is not there.
     */
    const { id } = await seedJob("claim-outage");

    const create = payload.create.bind(payload);
    const spy = vi
      .spyOn(payload, "create")
      .mockImplementation((args: Parameters<typeof create>[0]) =>
        args.collection === "claims"
          ? Promise.reject(new Error("D1_ERROR: network is unreachable"))
          : create(args)
      );

    let response: Response;

    try {
      response = await deliver(successReport(id));
    } finally {
      spy.mockRestore();
    }

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(muxUploads).toEqual([]);
    expect((await renderRow(id))?.state).toBe("queued");

    // And the retry Remotion's `invokeWebhook` will now make gets through.
    expect((await deliver(successReport(id))).status).toBe(200);
    expect(muxUploads).toHaveLength(1);
  });

  it("does not resurrect a cancelled sponsorship", async () => {
    const { id, sponsorship: sponsorshipId } = await seedJob(
      "cancelled",
      "cancelled"
    );

    expect((await deliver(successReport(id))).status).toBe(200);

    const after = await sponsorship(sponsorshipId);
    expect(after.status).toBe("cancelled");
    expect(after.previewVideoPlaybackId ?? null).toBeNull();
    expect(after.sponsoredVideoPlaybackId ?? null).toBeNull();
  });

  it("does not resurrect a rejected one", async () => {
    /*
     * `rejected` looks terminal and is not. `lib/sponsorshipStatus.ts` allows
     * `rejected -> pending_resubmission`, because the shipped product re-opens
     * a rejected sponsorship — so attaching the composite here means the
     * *rejected* submission's video goes live the moment the sponsor's re-edit
     * is approved. That is the sharpest version of this whole guard, and the
     * reason it is not enough to reason about which statuses are "dead".
     */
    const { id, sponsorship: sponsorshipId } = await seedJob(
      "rejected",
      "rejected"
    );

    expect((await deliver(successReport(id))).status).toBe(200);

    const after = await sponsorship(sponsorshipId);
    expect(after.status).toBe("rejected");
    expect(after.previewVideoPlaybackId ?? null).toBeNull();
  });

  it("does not attach to a sponsorship the sponsor is re-editing", async () => {
    // The same worry one step earlier: the overlay text or the logo is being
    // changed right now, so this composite is of content nobody has approved.
    const { id, sponsorship: sponsorshipId } = await seedJob(
      "resubmitting",
      "pending_resubmission"
    );

    expect((await deliver(successReport(id))).status).toBe(200);
    expect(
      (await sponsorship(sponsorshipId)).previewVideoPlaybackId ?? null
    ).toBeNull();
  });

  it("attaches to a sponsorship that is still waiting to be paid for", async () => {
    // The positive beside all three negatives above, for the second status
    // `STATUSES_AWAITING_A_COMPOSITION` admits. The ordinary case is now
    // `pending_approval` — renders are submitted once the payment is paid —
    // and "advances the render and stores the Mux ids" covers it; this one
    // pins that `pending_payment` is still admitted, as `endpoints/render.ts`
    // explains. Without a positive, every refusal above would also pass
    // against a handler that never attached anything at all.
    const { id, sponsorship: sponsorshipId } = await seedJob(
      "unpaid",
      "pending_payment"
    );

    expect((await deliver(successReport(id))).status).toBe(200);
    expect((await sponsorship(sponsorshipId)).previewVideoPlaybackId).toBe(
      `pb-${RUN}-0`
    );
  });

  it("is refused by the callback's own guard, not by enforceStatusTransitions", async () => {
    /*
     * **The plan expected `hooks/enforceStatusTransitions.ts` to refuse the
     * write to a dead sponsorship. It does not, and this is the proof.**
     *
     * That hook compares `originalDoc.status` with `data.status`, and `data`
     * is the whole merged document by the time a collection `beforeChange`
     * runs — `fields/hooks/beforeValidate/promise.js` (3.89.0) fills every
     * absent field from `originalDoc`. So an update that writes only a
     * playback id arrives carrying the status it already had, `from === to`,
     * and `canTransition` allows it. There is no transition, because the
     * callback is not making one.
     *
     * Which means the status check in `endpoints/render.ts` is not a second
     * line of defence behind a hook — it is the only one. Deleting it does not
     * produce a 400 from the hook; it produces a cancelled sponsorship holding
     * a composed video.
     */
    const sponsorshipId = await seedSponsorship("hook-proof", "cancelled");

    const updated = await payload.update({
      collection: "sponsorships",
      data: { previewVideoPlaybackId: `pb-hook-proof-${RUN}` },
      id: sponsorshipId,
      overrideAccess: true,
    });

    expect(updated.status).toBe("cancelled");
    expect(updated.previewVideoPlaybackId).toBe(`pb-hook-proof-${RUN}`);
  });

  it("records the render as ready even when the sponsorship has moved on", async () => {
    // The render *did* finish, and it cost Lambda time somebody paid for.
    // Losing that fact means a retry re-renders and pays for it twice — so the
    // render row is advanced before the sponsorship is even looked at, and
    // regardless of what that lookup decides.
    const { id, sponsorship: sponsorshipId } = await seedJob(
      "moved-on",
      "cancelled"
    );

    await deliver(successReport(id));

    const row = await renderRow(id);
    expect(row?.state).toBe("ready");
    expect(row?.muxAssetId).toBe(`asset-${RUN}-0`);
    expect(row?.muxPlaybackId).toBe(`pb-${RUN}-0`);
    expect(
      (await sponsorship(sponsorshipId)).previewVideoPlaybackId ?? null
    ).toBeNull();
  });

  it("records the render when its sponsorship was deleted mid-render", async () => {
    // `renders.sponsorship` is nullable and set-null on delete, precisely so
    // the Mux asset id survives the sponsorship — it is what Mux bills for
    // every month, and a render row without it is an asset nobody can name.
    const { id, sponsorship: sponsorshipId } = await seedJob("deleted");

    await payload.delete({
      collection: "sponsorships",
      id: sponsorshipId,
      overrideAccess: true,
    });

    expect((await deliver(successReport(id))).status).toBe(200);

    const row = await renderRow(id);
    expect(row?.state).toBe("ready");
    expect(row?.muxAssetId).toBe(`asset-${RUN}-0`);
  });

  it("answers 200 to all of those, so Lambda stops retrying a settled decision", async () => {
    // A 4xx or 5xx makes Remotion's `invokeWebhook` retry a decision that
    // will not change, and then give up. Every status a sponsorship can be in when a render lands gets
    // the same answer, and the answer is byte for byte the one the happy path
    // gives.
    const reference = await snapshot(
      await deliver(successReport((await seedJob("ack-reference")).id))
    );

    for (const status of [
      "active",
      "cancelled",
      "expired",
      "pending_approval",
      "pending_payment",
      "pending_resubmission",
      "rejected",
    ] as Status[]) {
      const { id } = await seedJob(`ack-${status}`, status);

      expect(await snapshot(await deliver(successReport(id)))).toEqual(
        reference
      );
    }
  });

  it("records a failed render with the reason Lambda gave", async () => {
    const { id } = await seedJob("failed");

    const response = await deliver(
      lambdaReport(id, "error", {
        errors: [
          { message: "Timed out after 120000ms", name: "TimeoutError" },
          { message: "and the retry did too", name: "TimeoutError" },
        ],
      })
    );

    expect(response.status).toBe(200);

    const row = await renderRow(id);
    expect(row?.state).toBe("failed");
    // Verbatim, and every one of them: an operator has nothing else to go on.
    expect(row?.failureReason).toBe(
      "Timed out after 120000ms; and the retry did too"
    );
  });

  it("records a reason even when Lambda gave none", async () => {
    // An empty `failureReason` reads as "nobody recorded why", which is a
    // different and much worse thing to find in an admin panel than "Lambda
    // did not say".
    const { id } = await seedJob("failed-silent");

    await deliver(lambdaReport(id, "timeout"));

    const row = await renderRow(id);
    expect(row?.state).toBe("failed");
    expect(row?.failureReason).toBe(
      'Remotion Lambda reported "timeout" without an error message.'
    );
  });

  it("does not upload to Mux when Lambda reports a failure", async () => {
    const { id, sponsorship: sponsorshipId } =
      await seedJob("failed-no-upload");

    await deliver(
      lambdaReport(id, "error", { errors: [{ message: "Out of memory" }] })
    );

    expect(muxUploads).toEqual([]);
    expect(
      (await sponsorship(sponsorshipId)).previewVideoPlaybackId ?? null
    ).toBeNull();

    // The positive beside the negative: a success for a different job, with
    // the same fixtures and the same fake, does upload. Without it this test
    // passes against a handler that never uploads at all.
    const succeeding = await seedJob("failed-no-upload-control");
    await deliver(successReport(succeeding.id));
    expect(muxUploads).toHaveLength(1);
  });

  it("treats a success with no output as a failed render", async () => {
    // Lambda said the render finished and named nothing to upload. That is a
    // fact worth recording rather than a 400 Remotion's `invokeWebhook` would
    // retry twice more to no effect.
    const { id } = await seedJob("no-output");

    expect((await deliver(lambdaReport(id, "success"))).status).toBe(200);
    expect(muxUploads).toEqual([]);

    const row = await renderRow(id);
    expect(row?.state).toBe("failed");
    expect(row?.failureReason).toBe(
      "Remotion Lambda reported a success with no output URL."
    );
  });

  it("answers 502 when Mux is unreachable, so the callback is retried", async () => {
    const { id } = await seedJob("mux-outage");
    muxWillAnswer = () => Promise.reject(new Error("connect ETIMEDOUT"));

    const response = await deliver(successReport(id));

    expect(response.status).toBe(502);
    // No asset was created, so the claim is handed back — without that, the
    // retry this 502 asks for would be turned away as a replay and the
    // composite lost.
    expect(await completionsFor(id)).toBe(0);

    // The payoff, and the positive beside the negative: the retry finishes it.
    muxCreatesAnAsset();
    expect((await deliver(successReport(id))).status).toBe(200);
    expect((await renderRow(id))?.state).toBe("ready");
  });

  it("says an asset may exist in Mux when the create times out, and hands the claim back", async () => {
    /*
     * A timeout is not "no asset was created": Mux may have made the asset
     * and the answer simply never arrived. The claim is still handed back —
     * without it the retry the 502 asks for is turned away as a replay and
     * the composite is lost — so the log has to say that a possibly billed
     * asset may exist, under the passthrough that names this render.
     */
    const { id } = await seedJob("mux-timeout");
    const renderId = (await renderRow(id))?.id;
    const errorLog = vi.spyOn(payload.logger, "error");

    muxWillAnswer = () =>
      Promise.reject(
        new DOMException("The operation timed out.", "TimeoutError")
      );

    try {
      const response = await deliver(successReport(id));

      expect(response.status).toBe(502);
      expect(await completionsFor(id)).toBe(0);

      const lines = errorLog.mock.calls.map((call) =>
        call.filter((arg) => typeof arg === "string").join(" ")
      );

      expect(
        lines.some(
          (line) =>
            line.startsWith("[render] ") &&
            line.includes("may exist in Mux") &&
            line.includes(`passthrough render:${renderId}`)
        )
      ).toBe(true);
    } finally {
      errorLog.mockRestore();
    }
  });

  it("answers 502 when Mux refuses the upload", async () => {
    // A 4xx from Mux is also an asset that was not created, so it is the same
    // decision as an outage: nothing to orphan, and a retry costs nothing.
    const { id } = await seedJob("mux-refused");
    muxWillAnswer = () =>
      Promise.resolve(
        jsonResponse({ error: { messages: ["input is invalid"] } }, 400)
      );

    expect((await deliver(successReport(id))).status).toBe(502);
    expect(await completionsFor(id)).toBe(0);
    expect((await renderRow(id))?.state).toBe("uploading");
  });

  it("does not point a sponsorship at an asset that will never play", async () => {
    /*
     * Mux accepts an upload and then fails to prepare it, and `asset.ready` is
     * asynchronous — so the create can come back with no public playback id at
     * all. A sponsorship pointing at that is a dead player on a public page.
     *
     * The asset exists and is billable by the time this is known, so the claim
     * is **not** handed back: a retry would only make a second one. The id is
     * recorded instead, which is what a cleanup has to work from.
     */
    const { id, sponsorship: sponsorshipId } = await seedJob("unplayable");
    muxCreatesAnAsset({ playbackIds: [], status: "errored" });

    expect((await deliver(successReport(id))).status).toBe(200);

    const row = await renderRow(id);
    expect(row?.state).toBe("failed");
    expect(row?.muxAssetId).toBe(`asset-${RUN}-0`);
    expect(row?.failureReason).toMatch(/not playable/);
    expect(await completionsFor(id)).toBe(1);
    expect(
      (await sponsorship(sponsorshipId)).previewVideoPlaybackId ?? null
    ).toBeNull();
  });

  it("ignores a playback id that is not public", async () => {
    // A signed playback id is not something an unauthenticated gesture page
    // can play, so an asset that only has one is as unplayable as an asset
    // with none. Stage 6 exit criterion 7.
    const { id } = await seedJob("signed-only");
    muxCreatesAnAsset({
      playbackIds: [{ id: `pb-signed-${RUN}`, policy: "signed" }],
    });

    expect((await deliver(successReport(id))).status).toBe(200);

    const row = await renderRow(id);
    expect(row?.state).toBe("failed");
    expect(row?.muxPlaybackId ?? null).toBeNull();
  });

  it("answers an unknown job id exactly as it answers a known one", async () => {
    /*
     * A 404 for a job this application never submitted would make a signed
     * callback an oracle for which renders exist — and the secret is one
     * shared value held by an AWS account, not a per-caller credential.
     *
     * Whole responses are compared, not status codes: a body or a header that
     * differs gives the game away exactly as well as a status does. The known
     * job is a replay, so both sides are decisions that do nothing and are
     * compared on equal terms.
     */
    const { id } = await seedJob("oracle-known");
    await deliver(successReport(id));

    const known = await snapshot(await deliver(successReport(id)));
    const unknown = await snapshot(
      await deliver(successReport(jobId("oracle-never-submitted")))
    );

    expect(unknown).toEqual(known);
    expect(unknown.status).toBe(200);

    // And a job that *was* acted on answers identically too, so the oracle is
    // not merely narrowed to "did anything happen".
    const fresh = await seedJob("oracle-acted");
    expect(await snapshot(await deliver(successReport(fresh.id)))).toEqual(
      unknown
    );

    // Nothing was written for the unknown job — no claim, so a later genuine
    // submission of that id is not turned away as a replay.
    expect(await completionsFor(jobId("oracle-never-submitted"))).toBe(0);
  });

  it("settles the render by our job id in customData, not by Remotion's renderId", async () => {
    /*
     * Remotion picks its `renderId` inside the start routine, after the row
     * was claimed, so the only id both sides know in advance is ours — and
     * Remotion echoes it back in `customData`. Priced so the two cannot be
     * confused: the body's `renderId` is *another* seeded job's id, so a
     * handler that still matched on `renderId` settles the wrong render.
     */
    const { id, sponsorship: sponsorshipId } = await seedJob("by-custom-data");
    const decoy = await seedJob("by-custom-data-decoy");
    const report = { ...successReport(id), renderId: decoy.id };
    const body = JSON.stringify(report);

    const response = await deliver(report);

    expect(response.status).toBe(200);
    // The header really was Remotion's scheme, computed independently.
    expect(remotionSignature(body, STUB_SECRET)).toMatch(
      /^sha512=[0-9a-f]{128}$/
    );
    expect((await renderRow(id))?.state).toBe("ready");
    expect((await sponsorship(sponsorshipId)).previewVideoPlaybackId).toBe(
      `pb-${RUN}-0`
    );
    // And the job Remotion's id happens to name is untouched.
    expect((await renderRow(decoy.id))?.state).toBe("queued");
    expect(await completionsFor(decoy.id)).toBe(0);
    expect(muxUploads).toHaveLength(1);
  });

  it("refuses the same body signed under the old SHA-256 scheme", async () => {
    /*
     * The scheme this handler verified before it adopted Remotion's. A
     * callback signed that way is now forged as far as this handler knows —
     * whichever header it arrives in.
     */
    const { id } = await seedJob("legacy-signature");
    const report = successReport(id);
    const body = JSON.stringify(report);
    const legacy = await signRenderCallback(
      body,
      STUB_SECRET,
      LEGACY_SHA256_SCHEME
    );

    // In the header it used to go in, and alone.
    const oldHeader = await handleEndpoints({
      config,
      request: new Request(`${SITE}${CALLBACK_PATH}`, {
        body,
        headers: {
          "Content-Type": "application/json",
          [LEGACY_SHA256_SCHEME.header]: legacy,
        },
        method: "POST",
      }),
    });

    expect(oldHeader.status).toBe(401);
    // And in Remotion's header, where it is the wrong hash.
    expect((await deliver(report, { header: legacy })).status).toBe(401);
    expect(muxUploads).toEqual([]);
    expect((await renderRow(id))?.state).toBe("queued");
    expect(await completionsFor(id)).toBe(0);

    // The positive beside the negatives: the same bytes, signed Remotion's
    // way, settle the render.
    expect((await deliver(report)).status).toBe(200);
    expect((await renderRow(id))?.state).toBe("ready");
  });

  it("answers a body with no job id of ours as an unknown job, and changes nothing", async () => {
    /*
     * Review Focus 3. A signed body that names no job this application
     * claimed is answered as an unknown job is: 200 `{"status":"ok"}`, byte
     * for byte, and no work — so Lambda stops retrying, and the answer is no
     * oracle.
     *
     * `customData: null` is not hypothetical: it is what `launch.js` sends
     * (`params.webhook.customData ?? null`) for a render submitted without
     * any. Every body here carries a real seeded job's id as its `renderId`,
     * so a handler that fell back to Remotion's id would settle that render
     * and the assertions below would see it.
     */
    const { id } = await seedJob("no-custom-data");
    const reference = await snapshot(
      await deliver(successReport(jobId("no-custom-data-never-submitted")))
    );
    const { customData: _dropped, ...withoutCustomData } = {
      ...successReport(id),
      renderId: id,
    };

    for (const report of [
      withoutCustomData,
      { ...withoutCustomData, customData: null },
      { ...withoutCustomData, customData: {} },
      { ...withoutCustomData, customData: { jobId: "" } },
      { ...withoutCustomData, customData: { jobId: 7 } },
      { ...withoutCustomData, customData: { jobId: [id] } },
      { ...withoutCustomData, customData: id },
    ]) {
      expect(await snapshot(await deliver(report))).toEqual(reference);
    }

    expect(reference.status).toBe(200);
    expect(JSON.parse(reference.body)).toEqual({ status: "ok" });
    expect(muxUploads).toEqual([]);
    expect((await renderRow(id))?.state).toBe("queued");
    expect(await completionsFor(id)).toBe(0);

    // The positive beside the negatives: with its job id where Remotion puts
    // it, the same render settles.
    expect((await deliver(successReport(id))).status).toBe(200);
    expect((await renderRow(id))?.state).toBe("ready");
  });

  it("answers 400 to a signed body that is not a render report", async () => {
    // Signed, so it came from this application's own secret, and a retry of
    // the same bytes will be refused the same way. There is nothing to be
    // idempotent about and nothing to claim.
    //
    // A JSON object is a report even when it names no job of ours; that case
    // is answered 200 — see "answers a body with no job id of ours".
    for (const body of [
      "not json at all",
      JSON.stringify([successReport(jobId("not-a-report"))]),
      JSON.stringify("success"),
      JSON.stringify(null),
      JSON.stringify(7),
    ]) {
      const signature = remotionSignature(body, STUB_SECRET);
      const response = await handleEndpoints({
        config,
        request: new Request(`${SITE}${CALLBACK_PATH}`, {
          body,
          headers: {
            "Content-Type": "application/json",
            [SIGNATURE_HEADER]: signature,
          },
          method: "POST",
        }),
      });

      expect(response.status).toBe(400);
    }

    expect(muxUploads).toEqual([]);
  });
});

/**
 * `GET /api/mux/source/:id` — the short-lived source URL a render container
 * fetches the gesture's video from, behind a service token.
 *
 * Driven through `handleEndpoints` for the reason the callback's own suite
 * gives: half of what can go wrong is routing, and a handler called directly
 * passes whatever path it is mounted at. The signing key is generated in this
 * process and thrown away — there is no Mux signing key in this project, and
 * one committed to a repository would be a finding rather than a fixture.
 *
 * **None of this is evidence about Mux.** It proves that this application
 * refuses the right callers and mints a real signed token for the right ones.
 * Whether Mux honours the token is Task 6's first contact, and `lib/mux.ts`
 * records the one thing already known to differ: a `public` playback policy —
 * which is what every asset in this product has — is served by Mux to anyone
 * who asks, token or not.
 */
describe("the Mux source endpoint", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let activePlaybackId: string;
  let inactivePlaybackId: string;

  const SOURCE_PATH = "/api/mux/source";
  const STUB_SERVICE_TOKEN = "stub-mux-source-service-token-for-tests-only";
  const STUB_SIGNING_KEY_ID = "signing-key-for-tests-only";

  const ORIGINAL_SERVICE_TOKEN = process.env.MUX_SOURCE_SERVICE_TOKEN;
  const ORIGINAL_SIGNING_ID = process.env.MUX_SIGNING_KEY_ID;
  const ORIGINAL_SIGNING_KEY = process.env.MUX_SIGNING_KEY_PRIVATE;

  const HOURS_2 = 2 * 60 * 60 * 1000;

  /** One request, with whatever `Authorization` the caller wants — or none. */
  const ask = (playbackId: string, authorization?: null | string) =>
    handleEndpoints({
      config,
      request: new Request(
        `${SITE}${SOURCE_PATH}/${encodeURIComponent(playbackId)}`,
        {
          headers:
            authorization === undefined
              ? { Authorization: `Bearer ${STUB_SERVICE_TOKEN}` }
              : authorization === null
                ? {}
                : { Authorization: authorization },
          method: "GET",
        }
      ),
    });

  /** Everything about a response a caller can see. */
  const snapshot = async (response: Response) => ({
    body: await response.text(),
    headers: [...response.headers.entries()].sort(),
    status: response.status,
  });

  const seedGesture = async (label: string, isActive: boolean) => {
    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Bron ${label} ${RUN}` },
      locale: "nl",
    });
    const playbackId = `pb-source-${label}-${RUN}`;

    await payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive,
        name: `Bron ${label} ${RUN}`,
        playbackId,
      },
      locale: "nl",
    });

    return playbackId;
  };

  beforeAll(async () => {
    payload = await getPayload({ config });

    const pair = await crypto.subtle.generateKey(
      {
        hash: "SHA-256",
        modulusLength: 2048,
        name: "RSASSA-PKCS1-v1_5",
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      ["sign", "verify"]
    );
    const pkcs8 = new Uint8Array(
      await crypto.subtle.exportKey("pkcs8", pair.privateKey)
    );
    const body = btoa(
      Array.from(pkcs8, (byte) => String.fromCharCode(byte)).join("")
    ).replace(/(.{64})/g, "$1\n");

    process.env.MUX_SIGNING_KEY_PRIVATE = btoa(
      `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`
    );
    process.env.MUX_SIGNING_KEY_ID = STUB_SIGNING_KEY_ID;
    process.env.MUX_SOURCE_SERVICE_TOKEN = STUB_SERVICE_TOKEN;

    activePlaybackId = await seedGesture("actief", true);
    inactivePlaybackId = await seedGesture("inactief", false);
  });

  afterAll(() => {
    restoreEnv("MUX_SOURCE_SERVICE_TOKEN", ORIGINAL_SERVICE_TOKEN);
    restoreEnv("MUX_SIGNING_KEY_ID", ORIGINAL_SIGNING_ID);
    restoreEnv("MUX_SIGNING_KEY_PRIVATE", ORIGINAL_SIGNING_KEY);
  });

  it("boots with the fixtures this file assumes", () => {
    // `beforeAll` throwing is reported as *skipped* rather than failed, so a
    // run that seeded nothing would look green having asserted nothing.
    expect(activePlaybackId).toContain(RUN);
    expect(inactivePlaybackId).toContain(RUN);
    expect(process.env.MUX_SOURCE_SERVICE_TOKEN).toBe(STUB_SERVICE_TOKEN);
  });

  it("issues a source URL for a gesture's playback id", async () => {
    const response = await ask(activePlaybackId);

    expect(response.status).toBe(200);

    const issued = (await response.json()) as {
      expiresAt: string;
      url: string;
    };

    expect(issued.url).toContain(
      `https://stream.mux.com/${activePlaybackId}/high.mp4?token=`
    );
    // A real JWT, not a URL with a word in it: three base64url segments.
    expect(new URL(issued.url).searchParams.get("token")).toMatch(
      /^[\w-]+\.[\w-]+\.[\w-]+$/
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("issues a URL that expires", async () => {
    /*
     * The arithmetic proof is in `mux.test.ts`, which reads `exp` out of the
     * signed claims — a URL minted with no expiry at all fails there, and so
     * does one with a hundred-year window. What this asserts is the half only
     * the endpoint can get wrong: that the expiry it *reports* is the real
     * one, and that it is hours rather than years away.
     */
    const before = Date.now();
    const issued = (await (await ask(activePlaybackId)).json()) as {
      expiresAt: string;
    };
    const expiresAt = Date.parse(issued.expiresAt);

    expect(Number.isNaN(expiresAt)).toBe(false);
    expect(expiresAt).toBeGreaterThanOrEqual(before + HOURS_2 - 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + HOURS_2);
  });

  it("refuses a request with no service token", async () => {
    const response = await ask(activePlaybackId, null);

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("stream.mux.com");

    // The positive beside the negative: the same request, with the token, is
    // answered — so this refusal is the missing header and nothing else.
    expect((await ask(activePlaybackId)).status).toBe(200);
  });

  it("refuses a wrong service token", async () => {
    // Priced so that only the token can refuse it: the same header shape, the
    // same length, one character different.
    const wrong = `${STUB_SERVICE_TOKEN.slice(0, -1)}X`;

    expect(wrong).toHaveLength(STUB_SERVICE_TOKEN.length);
    expect((await ask(activePlaybackId, `Bearer ${wrong}`)).status).toBe(401);
    // And a correct token presented without the scheme is still not a token.
    expect((await ask(activePlaybackId, STUB_SERVICE_TOKEN)).status).toBe(401);
  });

  it("answers a missing playback id the same way as a wrong token", async () => {
    /*
     * Otherwise this endpoint enumerates which gestures exist, to anybody
     * guessing playback ids — and a playback id is not a secret: the public
     * gesture page renders one in its player.
     *
     * The fixture is priced so the comparison means something. The unknown-id
     * request carries the **correct** service token, so it reaches the lookup
     * and is refused by the guard under test; if both answers came from the
     * same early return for the same reason, the assertion below would be
     * satisfied by an endpoint that refused everything. The 200 underneath is
     * what rules that out.
     */
    const unknown = await snapshot(await ask(`pb-never-issued-${RUN}`));
    const wrongToken = await snapshot(
      await ask(activePlaybackId, "Bearer not-the-service-token-at-all")
    );

    expect(unknown).toEqual(wrongToken);
    expect(unknown.status).toBe(401);
    expect((await ask(activePlaybackId)).status).toBe(200);
  });

  it("does not issue one for an inactive gesture", async () => {
    /*
     * A deactivated gesture is one the public API refuses to serve at all
     * (`access/index.ts`'s `publicReadActive`), and a render of it would put a
     * sponsor's logo on a video nobody can reach. The fixture differs from the
     * one above in exactly one column, so `isActive` is the only thing that
     * can be refusing it.
     */
    const refused = await snapshot(await ask(inactivePlaybackId));
    const wrongToken = await snapshot(
      await ask(activePlaybackId, "Bearer not-the-service-token-at-all")
    );

    expect(refused.status).toBe(401);
    // And indistinguishable from a wrong token, so it does not leak that the
    // gesture exists either.
    expect(refused).toEqual(wrongToken);

    // The positive: activating that very gesture makes the same request work.
    const { docs } = await payload.find({
      collection: "gestures",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { playbackId: { equals: inactivePlaybackId } },
    });

    await payload.update({
      collection: "gestures",
      data: { isActive: true },
      id: docs[0]?.id ?? 0,
      overrideAccess: true,
    });

    try {
      expect((await ask(inactivePlaybackId)).status).toBe(200);
    } finally {
      await payload.update({
        collection: "gestures",
        data: { isActive: false },
        id: docs[0]?.id ?? 0,
        overrideAccess: true,
      });
    }
  });

  it("refuses every caller when no service token is configured", async () => {
    // Fails closed. An unset secret must not mean "no check": the alternative
    // is a staging deploy that hands the source of every gesture to anybody who
    // sends an empty `Authorization` header.
    const configured = process.env.MUX_SOURCE_SERVICE_TOKEN;
    restoreEnv("MUX_SOURCE_SERVICE_TOKEN", undefined);

    try {
      expect((await ask(activePlaybackId)).status).toBe(401);
      expect((await ask(activePlaybackId, "Bearer ")).status).toBe(401);
      expect((await ask(activePlaybackId, "Bearer undefined")).status).toBe(
        401
      );
    } finally {
      process.env.MUX_SOURCE_SERVICE_TOKEN = configured ?? "";
    }

    expect((await ask(activePlaybackId)).status).toBe(200);
  });

  it("compares the service token in constant time", async () => {
    /*
     * The same assertion `renderSignature.test.ts` makes about the callback's
     * HMAC, and for the same reason: a byte-by-byte `===` on a bearer token an
     * attacker can present repeatedly turns guessing it into a per-character
     * search. It is an assertion about the implementation rather than a timing
     * measurement, because a timing measurement in CI fails on a busy machine
     * instead of on a regression.
     *
     * `lib/constantTime.ts` is the third caller this helper now has — Task 2
     * extracted it from `endpoints/oauth.ts` when a second copy appeared, and
     * this is the copy that did not get written.
     */
    const source = await readFile(
      new URL("./render.ts", import.meta.url),
      "utf8"
    );

    // The positive: the presented token and the configured one meet in the
    // shared helper, and nowhere else.
    expect(source).toMatch(/equalConstantTime\(presented, serviceToken\)/);
    // The negatives, named precisely rather than broadly: the emptiness checks
    // above the comparison are `=== ""` and leak nothing, so a regex that
    // banned every `===` in this file would fail on those and teach the next
    // person to weaken it.
    expect(source).not.toMatch(/presented\s*===\s*serviceToken/);
    expect(source).not.toMatch(/serviceToken\s*===\s*presented/);
  });
});
