/**
 * `crypto.subtle` with real RSA keys, and no DOM at all.
 *
 * @vitest-environment node
 */

import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderSubmission, submitRenderJob } from "@/lib/renderJob";

const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);
const PLAYBACK_ID = "pbOriginalForTestsOnly1";
const ORIGIN = "https://smog-site-staging.example.workers.dev";

/** Stand-ins, never real credentials, and not shaped like any provider's. */
const STUB_KEY_ID = "signing-key-for-tests-only";
const STUB_CALLBACK_SECRET = "stub-render-secret-for-tests-only";

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

/** A logger that records, standing in for the one on a Payload instance. */
function fakePayload() {
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };

  return { logger, payload: { logger } as unknown as Payload };
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
    // `apps/remotion/src/Root.tsx` registers exactly one composition under
    // this id, and `SponsoredVideoSchema` in `src/types/schema.ts` is the
    // shape of the props below. Nothing enforces that agreement across the two
    // apps at build time — Task 6 deploys a serve URL built from that project
    // and is where a rename would surface, as every render failing.
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
    // is the overlay text. `MAX_SPONSOR_NAME` is 35 here and the Remotion
    // schema caps `sponsorName` at 35 too, so the two agree by coincidence
    // rather than by construction — a longer text would be refused by zod
    // inside the render rather than by the wizard.
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
     * The submission is logged, and a render payload is stored in S3 by
     * Remotion Lambda for the life of the render. The secret is what makes a
     * callback admissible — anyone holding it can put any video on any gesture
     * — so the transport adds it at send time and it is never a field on this
     * object.
     */
    const submission = await renderSubmission(input());

    expect(JSON.stringify(submission)).not.toContain(STUB_CALLBACK_SECRET);
    expect(Object.keys(submission.webhook)).toEqual(["url"]);
  });
});

describe("submitting a render job", () => {
  it("submits nothing, and says so, when Lambda is not configured", async () => {
    /*
     * **The seam, and it is empty on purpose.** A render cannot be submitted
     * from this environment: there is no deployed Remotion Lambda, and the
     * plan's "BLOCKED ON CREDENTIALS" says why nothing here may deploy one.
     * What this asserts is that the gap is *stated* — a checkout that silently
     * did nothing would leave a sponsor waiting for a composite that was never
     * going to arrive, with nothing in any log saying so.
     */
    restoreEnv("REMOTION_FUNCTION_NAME", undefined);
    restoreEnv("REMOTION_REGION", undefined);
    restoreEnv("REMOTION_SERVE_URL", undefined);

    const { logger, payload } = fakePayload();

    await submitRenderJob(payload, input());

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(String(logger.info.mock.calls[0]?.[0])).toContain("42");
    expect(String(logger.info.mock.calls[0]?.[0])).toContain(
      "REMOTION_FUNCTION_NAME"
    );
    // Nothing was prepared, so nothing was signed: an unconfigured deployment
    // does not need a Mux signing key to complete a checkout.
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("prepares the submission but still sends nothing once it is configured", async () => {
    /*
     * The other branch, which Task 6 is the first that can act on. With a
     * function named, the submission is built — so a broken source URL or a
     * missing signing key surfaces here rather than on first contact — and the
     * log line says plainly that it was not sent. Task 6 replaces this
     * function's body; nothing else in the application changes.
     */
    process.env.REMOTION_FUNCTION_NAME = "remotion-render-for-tests-only";
    process.env.REMOTION_REGION = "eu-central-1";
    process.env.REMOTION_SERVE_URL = "https://example.invalid/sites/smog";

    const { logger, payload } = fakePayload();

    try {
      await submitRenderJob(payload, input());
    } finally {
      restoreEnv("REMOTION_FUNCTION_NAME", undefined);
      restoreEnv("REMOTION_REGION", undefined);
      restoreEnv("REMOTION_SERVE_URL", undefined);
    }

    expect(logger.warn).toHaveBeenCalledTimes(1);

    const said = String(logger.warn.mock.calls[0]?.[0]);

    expect(said).toContain("42");
    expect(said).toContain("remotion-render-for-tests-only");
    expect(said).toContain("SponsoredVideo");
    // And the line that would be the leak: the prepared submission carries a
    // signed source URL, and a log is not where a credential goes.
    expect(said).not.toContain("token=");
  });
});
