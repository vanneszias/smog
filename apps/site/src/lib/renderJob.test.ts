/**
 * `crypto.subtle` with real RSA keys, and no DOM at all.
 *
 * @vitest-environment node
 */

import type { Payload } from "payload";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import * as remotionLambda from "@/lib/remotionLambda";
import { RemotionStartError } from "@/lib/remotionLambda";
import { renderSubmission, submitRenderJob } from "@/lib/renderJob";

/*
 * The transport is stubbed: it is `remotionLambda.test.ts`'s subject, held
 * there byte for byte to the official client, and a call here must never reach
 * AWS. What this file proves is what `submitRenderJob` asks of it and does
 * around it — the claim before, the release after a failure, and what is
 * logged.
 *
 * A spy on the module rather than `vi.mock`: `vitest.config.mts` sets
 * `isolate: false`, so `lib/renderJob.ts` may already be loaded by another
 * file with that file's mock bound into it, and a second `vi.mock` factory
 * would hand this file a function nothing calls. A spy patches the one shared
 * module every importer reads through.
 *
 * That relies on Vitest's transformed module namespace being writable, which
 * it is under this config (Vite's SSR transform, `node` and `jsdom`
 * environments). It would not hold under native ESM, where a namespace's
 * bindings are read-only, or in Vitest's browser mode; there, `vi.mock` with
 * `isolate: true` for these files is the way back.
 */
let startRender: MockInstance<typeof remotionLambda.startRemotionRender>;

const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);
const PLAYBACK_ID = "pbOriginalForTestsOnly1";
const ORIGIN = "https://smog-site-staging.example.workers.dev";

/** Stand-ins, never real credentials, and not shaped like any provider's. */
const STUB_KEY_ID = "signing-key-for-tests-only";
const STUB_CALLBACK_SECRET = "stub-render-secret-for-tests-only";

const FUNCTION_NAME = "remotion-render-for-tests-only";
const REGION = "eu-central-1";
const SERVE_URL = "https://example.invalid/sites/smog";
const REMOTION_RENDER_ID = "8l1xk2p3qz";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const ORIGINAL = {
  MUX_SIGNING_KEY_ID: process.env.MUX_SIGNING_KEY_ID,
  MUX_SIGNING_KEY_PRIVATE: process.env.MUX_SIGNING_KEY_PRIVATE,
  REMOTION_FUNCTION_NAME: process.env.REMOTION_FUNCTION_NAME,
  REMOTION_REGION: process.env.REMOTION_REGION,
  REMOTION_SERVE_URL: process.env.REMOTION_SERVE_URL,
  RENDER_CALLBACK_SECRET: process.env.RENDER_CALLBACK_SECRET,
};

/**
 * Puts a variable back the way it was, including back to *absent*.
 *
 * `process.env.X = undefined` leaves the string `"undefined"` behind, and
 * `vitest.config.mts` sets `isolate: false`, so every file this worker runs
 * afterwards shares this process.
 */
function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];

    return;
  }

  process.env[name] = value;
}

interface FakeRender {
  id: number;
  jobId: string;
  sponsorship: number;
  state: string;
}

interface JobIdWhere {
  where: { jobId: { equals: string } };
}

/**
 * A Payload instance reduced to what `submitRenderJob` touches: a logger that
 * records, and a `renders` table in memory behind the three calls
 * `lib/renderState.ts` makes. `renderState.test.ts` and the integration
 * suites hold those calls to a real D1; here the table only has to say which
 * rows exist, and when.
 */
function fakePayload() {
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
  const renders: FakeRender[] = [];
  const matching = ({ where }: JobIdWhere) =>
    renders.filter((row) => row.jobId === where.jobId.equals);
  const create = vi.fn(
    ({ data }: { data: Omit<FakeRender, "id"> }): Promise<FakeRender> => {
      const row = { id: renders.length + 1, ...data };

      renders.push(row);

      return Promise.resolve(row);
    }
  );
  const find = vi.fn((args: JobIdWhere) => {
    const docs = matching(args);

    return Promise.resolve({ docs, totalDocs: docs.length });
  });
  const remove = vi.fn((args: JobIdWhere) => {
    for (const row of matching(args)) {
      renders.splice(renders.indexOf(row), 1);
    }

    return Promise.resolve({ docs: [], errors: [] });
  });

  return {
    create,
    logger,
    payload: { create, delete: remove, find, logger } as unknown as Payload,
    renders,
  };
}

/** Every line logged at any level, with every argument, as one string each. */
function everythingLogged(logger: ReturnType<typeof fakePayload>["logger"]) {
  return [logger.error, logger.info, logger.warn].flatMap((level) =>
    level.mock.calls.map((call) => JSON.stringify(call))
  );
}

const input = (
  overrides: Partial<Parameters<typeof renderSubmission>[0]> = {}
) => ({
  logoUrl: null,
  now: NOW,
  origin: ORIGIN,
  overlayText: "Met dank aan Acme",
  playbackId: PLAYBACK_ID,
  sponsorshipId: 42,
  ...overrides,
});

beforeAll(async () => {
  startRender = vi
    .spyOn(remotionLambda, "startRemotionRender")
    .mockRejectedValue(new Error("startRemotionRender was not stubbed"));

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
  process.env.MUX_SIGNING_KEY_ID = STUB_KEY_ID;
  process.env.RENDER_CALLBACK_SECRET = STUB_CALLBACK_SECRET;
});

afterAll(() => {
  startRender.mockRestore();

  for (const [name, value] of Object.entries(ORIGINAL)) {
    restoreEnv(name, value);
  }
});

describe("the render submission", () => {
  it("boots with the key this file assumes", () => {
    // `beforeAll` throwing is reported as *skipped* rather than failed.
    expect(process.env.MUX_SIGNING_KEY_ID).toBe(STUB_KEY_ID);
  });

  it("renders the composition the Remotion project exposes", async () => {
    // `apps/render/src/Root.tsx` registers the composition under
    // `SPONSORED_VIDEO_COMPOSITION_ID`, and its `SponsoredVideoSchema` is
    // checked at compile time against `SponsoredVideoInputProps` — both from
    // `@smog/types/render`, which this app builds the submission from too. A
    // rename there breaks both apps at typecheck. The literal below is the
    // deployed name, pinned so a change to it is a deliberate diff: a serve
    // URL built before the rename would refuse every render.
    const submission = await renderSubmission(input());

    expect(submission.composition).toBe("SponsoredVideo");
    expect(submission.codec).toBe("h264");
  });

  it("points the render at a short-lived source URL for the gesture's video", async () => {
    // The composition fetches `videoSrc` and draws the overlay over it, so
    // this is the one prop that decides *which video* is sponsored.
    const submission = await renderSubmission(input());
    const source = new URL(submission.inputProps.videoSrc);

    expect(source.origin).toBe("https://stream.mux.com");
    expect(source.pathname).toBe(`/${PLAYBACK_ID}/high.mp4`);
    expect(source.searchParams.get("token")).toMatch(
      /^[\w-]+\.[\w-]+\.[\w-]+$/
    );
  });

  it("carries the sponsor's overlay text as the name Remotion draws", async () => {
    // One input, two columns: the wizard collects `sponsorName` once and
    // writes it to both `sponsorName` and `overlayText`, and what is composited
    // is the overlay text. `MAX_SPONSOR_NAME` here and the `apps/render`
    // schema's cap on `sponsorName` are both `SPONSOR_NAME_MAX_LENGTH` from
    // `@smog/types/render`, so they agree by construction: a text the wizard
    // accepts is never refused by zod inside the render.
    const submission = await renderSubmission(
      input({ overlayText: "Met dank aan Acme" })
    );

    expect(submission.inputProps.sponsorName).toBe("Met dank aan Acme");
  });

  it("includes the logo only when there is one", async () => {
    const withLogo = await renderSubmission(
      input({ logoUrl: `${ORIGIN}/api/media/file/logo.png` })
    );
    const without = await renderSubmission(input({ logoUrl: null }));

    expect(withLogo.inputProps.logoUrl).toBe(
      `${ORIGIN}/api/media/file/logo.png`
    );
    // Absent rather than `null`: `SponsoredVideoSchema` marks it
    // `z.string().optional()`, and zod refuses an explicit `null` there — which
    // would be every logo-less render failing inside Lambda rather than here.
    expect("logoUrl" in withLogo.inputProps).toBe(true);
    expect("logoUrl" in without.inputProps).toBe(false);
  });

  it("asks Lambda to call back at the address next.config.ts publishes", async () => {
    // Not the endpoint's own `/api/render/callback` path: AWS holds this URL
    // for the life of the render and retries against it, and `next.config.ts`
    // rewrites `/render/callback` to the handler precisely so that the address
    // a third party keeps is one this application publishes deliberately.
    const submission = await renderSubmission(input());

    expect(submission.webhook.url).toBe(`${ORIGIN}/render/callback`);
  });

  it("never puts the callback secret in the submission it builds", async () => {
    /*
     * A render payload is stored in S3 by Remotion Lambda for the life of the
     * render. The secret is what makes a callback admissible — anyone holding
     * it can put any video on any gesture — so `submitRenderJob` adds it only
     * to the start request, and it is never a field on this object.
     */
    const submission = await renderSubmission(input());

    expect(JSON.stringify(submission)).not.toContain(STUB_CALLBACK_SECRET);
    expect(Object.keys(submission.webhook)).toEqual(["url"]);
  });
});

describe("submitting a render job", () => {
  it("submits nothing, and says so, when Lambda is not configured", async () => {
    /*
     * The state every deployment is in until the Remotion Lambda deploy fills
     * in `REMOTION_FUNCTION_NAME` and `REMOTION_SERVE_URL`: `wrangler.jsonc`
     * already sets the region, and that alone is not a target. What this
     * asserts is that the gap is *stated* — a paid sponsorship that silently
     * got nothing would leave a sponsor waiting for a composite that was
     * never going to arrive, with nothing in any log saying so.
     */
    restoreEnv("REMOTION_FUNCTION_NAME", undefined);
    process.env.REMOTION_REGION = "eu-central-1";
    restoreEnv("REMOTION_SERVE_URL", undefined);
    startRender.mockClear();

    const { logger, payload, renders } = fakePayload();

    try {
      await submitRenderJob(payload, input());
    } finally {
      restoreEnv("REMOTION_REGION", undefined);
    }

    expect(startRender).not.toHaveBeenCalled();
    expect(renders).toEqual([]);

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(String(logger.info.mock.calls[0]?.[0])).toContain("42");
    expect(String(logger.info.mock.calls[0]?.[0])).toContain(
      "REMOTION_FUNCTION_NAME"
    );
    // Nothing was prepared, so nothing was signed: an unconfigured deployment
    // does not need a Mux signing key to record a payment.
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe("submitting a configured render job", () => {
  beforeEach(() => {
    process.env.REMOTION_FUNCTION_NAME = FUNCTION_NAME;
    process.env.REMOTION_REGION = REGION;
    process.env.REMOTION_SERVE_URL = SERVE_URL;
    process.env.RENDER_CALLBACK_SECRET = STUB_CALLBACK_SECRET;
    startRender.mockClear();
    startRender.mockResolvedValue({
      bucketName: "remotionlambda-eucentral1-abcdef1234",
      renderId: REMOTION_RENDER_ID,
    });
  });

  afterEach(() => {
    restoreEnv("REMOTION_FUNCTION_NAME", undefined);
    restoreEnv("REMOTION_REGION", undefined);
    restoreEnv("REMOTION_SERVE_URL", undefined);
    process.env.RENDER_CALLBACK_SECRET = STUB_CALLBACK_SECRET;
  });

  it("starts the render with the claimed row's job id in customData", async () => {
    /*
     * The id the callback settles by. Remotion names its render inside the
     * start routine, too late to key a row written before it; so the row is
     * keyed by a job id minted here, and Remotion carries it in
     * `webhook.customData` and echoes it in every webhook it sends.
     */
    const { logger, payload, renders } = fakePayload();

    await submitRenderJob(payload, input());

    expect(renders).toHaveLength(1);

    const [row] = renders;

    expect(row?.jobId).toMatch(UUID_PATTERN);
    expect(row?.sponsorship).toBe(42);
    expect(row?.state).toBe("queued");

    expect(startRender).toHaveBeenCalledTimes(1);
    expect(startRender.mock.calls[0]?.[0]).toEqual({
      composition: "SponsoredVideo",
      functionName: FUNCTION_NAME,
      inputProps: {
        sponsorName: "Met dank aan Acme",
        videoSrc: expect.stringMatching(
          new RegExp(
            `^https://stream\\.mux\\.com/${PLAYBACK_ID}/high\\.mp4\\?token=`
          )
        ),
      },
      region: REGION,
      serveUrl: SERVE_URL,
      webhook: {
        customData: { jobId: row?.jobId },
        secret: STUB_CALLBACK_SECRET,
        url: `${ORIGIN}/render/callback`,
      },
    });

    // Said once, with both ids, so an operator can go from a sponsorship to
    // the render in the Remotion bucket.
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0]?.[0]).toBe(
      `[renderJob] Submitted render ${row?.jobId} for sponsorship 42 (Remotion render ${REMOTION_RENDER_ID})`
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("claims the row before it starts the render", async () => {
    // A render that finished before its row was written would be answered as
    // a job this application never submitted, and its composite dropped.
    const { payload, renders } = fakePayload();
    let rowsWhenStarted = -1;

    startRender.mockImplementation((request) => {
      rowsWhenStarted = renders.filter(
        (row) => row.jobId === request.webhook.customData.jobId
      ).length;

      return Promise.resolve({ bucketName: "b", renderId: REMOTION_RENDER_ID });
    });

    await submitRenderJob(payload, input());

    expect(rowsWhenStarted).toBe(1);
  });

  it("mints a new job id for every render", async () => {
    // One sponsorship, two submissions' worth of renders: two rows, two ids. A
    // job id reused would make the second render's callback a replay.
    const { payload, renders } = fakePayload();

    await submitRenderJob(payload, input());
    await submitRenderJob(payload, input());

    expect(renders).toHaveLength(2);
    expect(renders[0]?.jobId).not.toBe(renders[1]?.jobId);
  });

  it("hands the claim back, logs the message only, and does not throw when the start fails", async () => {
    /*
     * A `queued` row for a render that was never started is a job nothing
     * will ever settle. And the error is reduced to its message: the cause
     * and the stack are the transport's business, and a log is not where
     * whatever they hold should go.
     */
    const { logger, payload, renders } = fakePayload();
    const refused = new Error(
      "[remotionLambda] Lambda refused the invoke with HTTP 403 (AccessDeniedException)",
      { cause: new Error("cause-that-must-not-be-logged") }
    );

    startRender.mockRejectedValue(refused);

    await expect(submitRenderJob(payload, input())).resolves.toBeUndefined();

    expect(startRender).toHaveBeenCalledTimes(1);
    expect(renders).toEqual([]);

    const jobId = startRender.mock.calls[0]?.[0].webhook.customData.jobId;

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0]).toEqual([
      `[renderJob] Failed to submit render ${jobId} for sponsorship 42: ${refused.message}`,
    ]);

    const logged = everythingLogged(logger).join("\n");

    expect(logged).not.toContain("cause-that-must-not-be-logged");
    expect(logged).not.toContain(" at ");
    expect(logged).not.toContain("token=");
    expect(logged).not.toContain(STUB_CALLBACK_SECRET);
  });

  it("refuses before claiming anything when RENDER_CALLBACK_SECRET is unset", async () => {
    // The callback would be answered 401, so the render would be paid for in
    // AWS and never settled here. Nothing is started and nothing is claimed.
    for (const unset of [undefined, "", "   "]) {
      restoreEnv("RENDER_CALLBACK_SECRET", unset);

      const { logger, payload, renders } = fakePayload();

      await expect(submitRenderJob(payload, input())).resolves.toBeUndefined();

      expect(renders).toEqual([]);
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(String(logger.error.mock.calls[0]?.[0])).toContain(
        "RENDER_CALLBACK_SECRET"
      );
      expect(String(logger.error.mock.calls[0]?.[0])).toContain("42");
    }

    expect(startRender).not.toHaveBeenCalled();
  });

  it("claims nothing and does not throw when the submission cannot be built", async () => {
    // The half-configured state a deploy passes through: a Lambda named and no
    // Mux signing key. The submission is built before the claim, so there is
    // no row to hand back.
    const original = process.env.MUX_SIGNING_KEY_ID;
    const { logger, payload, renders } = fakePayload();

    restoreEnv("MUX_SIGNING_KEY_ID", undefined);

    try {
      await expect(submitRenderJob(payload, input())).resolves.toBeUndefined();
    } finally {
      restoreEnv("MUX_SIGNING_KEY_ID", original);
    }

    expect(renders).toEqual([]);
    expect(startRender).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    // No job id is named: none was minted, because none was ever claimed.
    expect(String(logger.error.mock.calls[0]?.[0])).toMatch(
      /^\[renderJob\] Failed to submit a render for sponsorship 42: \[mux\] /
    );
  });

  it("starts nothing when the claim is already held", async () => {
    // `claimRenderJob` answers `null` when the insert lost to an existing row.
    // Starting anyway would be a second render under one job id.
    const { create, logger, payload } = fakePayload();

    create.mockRejectedValueOnce(new Error("UNIQUE constraint failed"));
    // The read-back that tells a lost race from an outage finds a row.
    (payload.find as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      docs: [{}],
      totalDocs: 1,
    });

    await expect(submitRenderJob(payload, input())).resolves.toBeUndefined();

    expect(startRender).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(String(logger.warn.mock.calls[0]?.[0])).toContain("already claimed");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("does not release a claim it never took when claiming fails outright", async () => {
    // `claimRenderJob` rethrows when the insert failed and no row exists —
    // the database is down. There is nothing to hand back, and a "could not
    // release" line beside the real fault would only mislead.
    const { create, logger, payload } = fakePayload();

    create.mockRejectedValueOnce(new Error("D1 is unreachable"));

    await expect(submitRenderJob(payload, input())).resolves.toBeUndefined();

    expect(startRender).not.toHaveBeenCalled();
    expect(payload.delete).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0]?.[0]).toBe(
      "[renderJob] Failed to submit a render for sponsorship 42: D1 is unreachable"
    );
  });

  it.each([
    [
      "HTTP 403",
      "[remotionLambda] Lambda refused the invoke with HTTP 403 (AccessDeniedException)",
    ],
    [
      "HTTP 429",
      "[remotionLambda] Lambda refused the invoke with HTTP 429 (TooManyRequestsException)",
    ],
  ])("hands the claim back when Lambda definitely did not start (%s)", async (_name, message) => {
    // Lambda refused the invoke, so no render exists and no webhook will ever
    // name this job: a `queued` row would only wait for the sweep to fail it.
    const { logger, payload, renders } = fakePayload();

    startRender.mockRejectedValue(
      new RemotionStartError(message, { definite: true })
    );

    await expect(submitRenderJob(payload, input())).resolves.toBeUndefined();

    const jobId = startRender.mock.calls[0]?.[0].webhook.customData.jobId;

    expect(renders).toEqual([]);
    expect(logger.error.mock.calls).toEqual([
      [
        `[renderJob] Failed to submit render ${jobId} for sponsorship 42: ${message}`,
      ],
    ]);
  });

  it.each([
    ["a timeout", "[remotionLambda] Lambda did not answer within 30000 ms"],
    [
      "HTTP 503",
      "[remotionLambda] Lambda refused the invoke with HTTP 503 (ServiceException)",
    ],
  ])("keeps the claim when Lambda may have started the render (%s)", async (_name, message) => {
    /*
     * The start may have been accepted and only the answer lost. Handing the
     * claim back would turn that render's webhook into "a job this
     * application never submitted" — paid for and thrown away. Kept, the row
     * stays `queued`: a late webhook settles it, and the stalled-render sweep
     * fails it if none ever comes.
     */
    const { logger, payload, renders } = fakePayload();

    startRender.mockRejectedValue(
      new RemotionStartError(message, { definite: false })
    );

    await expect(submitRenderJob(payload, input())).resolves.toBeUndefined();

    const jobId = startRender.mock.calls[0]?.[0].webhook.customData.jobId;

    expect(renders).toHaveLength(1);
    expect(renders[0]?.jobId).toBe(jobId);
    expect(renders[0]?.state).toBe("queued");
    expect(payload.delete).not.toHaveBeenCalled();
    expect(logger.error.mock.calls).toEqual([
      [
        `[renderJob] Render ${jobId} for sponsorship 42 may have started; keeping its claim for the callback or the stalled-render sweep: ${message}`,
      ],
    ]);
  });

  it.each([
    ["an empty origin", ""],
    ["a relative origin", "/somewhere"],
    ["a non-web scheme", "ftp://smog.example"],
    ["a javascript: origin", "javascript:alert(1)//"],
  ])("refuses before claiming when the callback URL is not absolute http(s): %s", async (_name, origin) => {
    // Lambda would post its result to nowhere, so the render would be paid
    // for and never settled.
    const { logger, payload, renders } = fakePayload();

    await expect(
      submitRenderJob(payload, input({ origin }))
    ).resolves.toBeUndefined();

    expect(renders).toEqual([]);
    expect(startRender).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(String(logger.error.mock.calls[0]?.[0])).toMatch(
      /^\[renderJob\] No render was submitted for sponsorship 42: .*callback URL/
    );
  });

  it("accepts a plain http callback origin, as local development has", async () => {
    // The positive beside the refusals above.
    const { payload, renders } = fakePayload();

    await submitRenderJob(payload, input({ origin: "http://localhost:3003" }));

    expect(renders).toHaveLength(1);
    expect(startRender.mock.calls[0]?.[0].webhook.url).toBe(
      "http://localhost:3003/render/callback"
    );
  });
});
