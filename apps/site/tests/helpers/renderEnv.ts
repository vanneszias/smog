/**
 * Puts a variable back the way it was, including back to *absent*.
 *
 * `process.env.X = undefined` does not unset X — Node coerces the value and
 * leaves the string `"undefined"` behind — and `vitest.config.mts` sets
 * `isolate: false`, so every file this worker runs afterwards shares this
 * process. A leftover `REMOTION_FUNCTION_NAME="undefined"` would put a later
 * file's render submission down the configured branch of a seam that cannot
 * submit.
 */
function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];

    return;
  }

  process.env[name] = value;
}

/** Every variable `configureRenders` sets, and so puts back. */
const RENDER_ENV = [
  "MUX_SIGNING_KEY_ID",
  "MUX_SIGNING_KEY_PRIVATE",
  "REMOTION_FUNCTION_NAME",
  "REMOTION_REGION",
  "REMOTION_SERVE_URL",
  "RENDER_CALLBACK_SECRET",
] as const;

/**
 * Points `submitRenderJob` at a Remotion Lambda, with a Mux signing key
 * generated in this process and thrown away, and returns what puts every
 * variable back, including back to absent.
 *
 * The Lambda is a name only: a caller must stub `startRemotionRender`
 * (`lib/remotionLambda.ts`) before anything submits, so no request can reach
 * AWS. Every value here is a stand-in, never a real credential, and none is
 * shaped like a provider's.
 *
 * Shared by the two suites that drive a render submission end to end — the
 * Mollie webhook, which submits, and checkout, which must not — so that the
 * "configured" both of them mean is one definition rather than two that
 * drift.
 */
export async function configureRenders(): Promise<() => void> {
  const original = Object.fromEntries(
    RENDER_ENV.map((name) => [name, process.env[name]])
  );
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

  process.env.MUX_SIGNING_KEY_ID = "signing-key-for-tests-only";
  process.env.MUX_SIGNING_KEY_PRIVATE = btoa(
    `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`
  );
  process.env.REMOTION_FUNCTION_NAME = "remotion-render-for-tests-only";
  process.env.REMOTION_REGION = "eu-central-1";
  process.env.REMOTION_SERVE_URL = "https://example.invalid/sites/smog";
  process.env.RENDER_CALLBACK_SECRET = "stub-render-secret-for-tests-only";

  return () => {
    for (const name of RENDER_ENV) {
      restoreEnv(name, original[name]);
    }
  };
}
