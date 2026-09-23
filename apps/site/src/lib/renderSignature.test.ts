/**
 * `node:fs` to read this module's own source — see "compares in constant
 * time" — which the default jsdom environment cannot load.
 *
 * @vitest-environment node
 */

import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  RENDER_SIGNATURE_SCHEME,
  signRenderCallback,
  verifyRenderCallback,
} from "@/lib/renderSignature";

/** Stand-ins, never real credentials, and not shaped like any provider's key. */
const SECRET = "render-callback-secret-for-tests-only";
const OTHER_SECRET = "a-different-secret-for-tests-only";

/**
 * The scheme this application used before it adopted Remotion's: a bare
 * HMAC-SHA-256 hex digest in `X-Render-Signature`.
 *
 * Kept, with its known-answer vector, for two reasons. The verifier still
 * takes a scheme, so the SHA-256 construction is still code that can break;
 * and "one scheme's signature is refused under the other" needs the other
 * scheme to exist. Nothing configures it any more.
 */
const LEGACY_SHA256_SCHEME = {
  algorithm: "SHA-256",
  header: "x-render-signature",
  prefix: "",
} as const;

/**
 * What Remotion Lambda sends, transcribed from `@remotion/serverless@4.0.484`
 * (`dist/invoke-webhook.js`, `calculateSignature`):
 *
 *     const hmac = Crypto.createHmac('sha512', secret);
 *     return 'sha512=' + hmac.update(payload).digest('hex');
 *
 * where `payload` is `JSON.stringify(body)` — the exact bytes posted — and the
 * value goes in `X-Remotion-Signature`. Written with `node:crypto`, as Remotion
 * writes it, so that it is an independent implementation of the Web Crypto
 * code under test rather than a second call to it.
 */
function remotionSignature(body: string, secret: string): string {
  return `sha512=${createHmac("sha512", secret).update(body).digest("hex")}`;
}

/** A trimmed Remotion success webhook: what the handler acts on. */
const BODY = JSON.stringify({
  type: "success",
  renderId: "8l1xk2p3qz",
  customData: { jobId: "render-1234" },
  outputUrl:
    "https://s3.eu-central-1.amazonaws.com/remotionlambda-eucentral1-abcdef1234/renders/8l1xk2p3qz/out.mp4",
});

/** The same fields, one value changed — what a forger would want accepted. */
const TAMPERED = JSON.stringify({
  type: "success",
  renderId: "8l1xk2p3qz",
  customData: { jobId: "render-1234" },
  outputUrl: "https://attacker.example/any-video-at-all.mp4",
});

/** A sibling module's source, for the assertion that reads one. */
function sourceOf(file: string): Promise<string> {
  return readFile(new URL(`./${file}`, import.meta.url), "utf8");
}

describe("the render callback signature", () => {
  it("accepts a body signed with the shared secret", async () => {
    const signature = await signRenderCallback(BODY, SECRET);

    expect(await verifyRenderCallback(BODY, signature, SECRET)).toBe(true);
    // The shape the endpoint and Remotion must agree on: `sha512=` and 64
    // bytes of HMAC-SHA-512 as lowercase hex.
    expect(signature).toMatch(/^sha512=[0-9a-f]{128}$/);
  });

  it("refuses a body that was altered after signing", async () => {
    // The whole point: the `outputUrl` in the body decides which video Mux
    // ingests and so which video the sponsorship gets, so a body that changed
    // on the way is a different instruction wearing a valid envelope.
    const signature = await signRenderCallback(BODY, SECRET);

    expect(await verifyRenderCallback(TAMPERED, signature, SECRET)).toBe(false);
  });

  it("refuses a correct signature over a different body", async () => {
    // The replay in the other direction: a signature this application really
    // did issue, lifted from one callback and presented with another body.
    const signature = await signRenderCallback(TAMPERED, SECRET);

    expect(await verifyRenderCallback(TAMPERED, signature, SECRET)).toBe(true);
    expect(await verifyRenderCallback(BODY, signature, SECRET)).toBe(false);
  });

  it("refuses an absent header, and an empty one", async () => {
    expect(await verifyRenderCallback(BODY, null, SECRET)).toBe(false);
    expect(await verifyRenderCallback(BODY, "", SECRET)).toBe(false);
    // Priced so only the guard under test can refuse them: the body and the
    // secret are the ones that verify on the line above, so the sole reason
    // these three are refused is the missing header.
    expect(await verifyRenderCallback(BODY, "   ", SECRET)).toBe(false);
    expect(
      await verifyRenderCallback(
        BODY,
        await signRenderCallback(BODY, SECRET),
        SECRET
      )
    ).toBe(true);
  });

  it("refuses a signature of the right shape but wrong secret", async () => {
    const forged = await signRenderCallback(BODY, OTHER_SECRET);

    // The right shape, so nothing but the secret distinguishes it: same
    // length, same alphabet, a real HMAC over the very body being checked.
    expect(forged).toMatch(/^sha512=[0-9a-f]{128}$/);
    expect(forged).not.toBe(await signRenderCallback(BODY, SECRET));
    expect(await verifyRenderCallback(BODY, forged, SECRET)).toBe(false);

    // And a body that names its own key is still checked against the
    // configured one. The body is the thing being authenticated, so a secret
    // read out of it authenticates nothing — an attacker would simply pick a
    // key, sign with it, and put whichever video they liked on a public page.
    const selfDeclared = JSON.stringify({
      ...(JSON.parse(BODY) as Record<string, unknown>),
      secret: OTHER_SECRET,
    });

    expect(
      await verifyRenderCallback(
        selfDeclared,
        await signRenderCallback(selfDeclared, OTHER_SECRET),
        SECRET
      )
    ).toBe(false);
  });

  it("refuses a signature that is merely a prefix of the right one", async () => {
    // A comparison that stops at the shorter of the two would accept this,
    // and the accumulate-then-compare loop below only defends against timing
    // if something else defends against length.
    const signature = await signRenderCallback(BODY, SECRET);

    expect(
      await verifyRenderCallback(BODY, signature.slice(0, 2), SECRET)
    ).toBe(false);
    expect(
      await verifyRenderCallback(BODY, signature.slice(0, -1), SECRET)
    ).toBe(false);
    expect(await verifyRenderCallback(BODY, `${signature}0`, SECRET)).toBe(
      false
    );
  });

  it("verifies nothing at all when no secret is configured", async () => {
    /*
     * The danger here is not what it looks like, and the difference is worth
     * recording rather than asserting past. Web Crypto refuses a zero-length
     * HMAC key, so an unset `RENDER_CALLBACK_SECRET` cannot produce a
     * signature anybody could get accepted — the first assertion below is the
     * measurement that says so. What the guard changes is that verification
     * *answers* instead of throwing, so a misconfigured deployment refuses
     * callbacks rather than 500ing on every one of them with a stack trace
     * that never names the missing secret.
     */
    await expect(signRenderCallback(BODY, "")).rejects.toThrow(
      /zero-length key/i
    );
    await expect(
      verifyRenderCallback(BODY, `sha512=${"0".repeat(128)}`, "")
    ).resolves.toBe(false);

    // The positive beside it: a header of that same shape under a configured
    // secret is a question this function answers rather than one it refuses
    // out of hand.
    await expect(
      verifyRenderCallback(BODY, await signRenderCallback(BODY, SECRET), SECRET)
    ).resolves.toBe(true);
  });

  it("compares in constant time", async () => {
    /*
     * Deliberately an assertion about the *implementation* rather than a
     * measurement. A timing measurement in CI fails on a busy machine instead
     * of on a regression, which is a test that trains people to re-run it.
     *
     * What matters is that every character is compared and the verdict read
     * once at the end: a byte-by-byte `===`, or an early `return` out of the
     * loop, leaks how many leading characters were right and turns 16^64
     * guesses into 16 guesses per character.
     *
     * Two files, because the comparison is shared with `endpoints/oauth.ts`
     * rather than written twice — so this asserts both that verification
     * delegates to it and that what it delegates to has the property.
     */
    const signature = await sourceOf("renderSignature.ts");
    const comparison = await sourceOf("constantTime.ts");

    // Verification compares through the shared helper, and never with `===`
    // on the two signature strings.
    // The line is wrapped by Biome now that the scheme is a third argument,
    // so the assertion spans the wrap rather than assuming one line.
    expect(signature).toMatch(/return equalConstantTime\(\s*header,/);
    expect(signature).not.toMatch(/===\s*expected/);
    expect(signature).not.toMatch(/header\s*===\s*expected/);
    expect(signature).not.toMatch(/===\s*await signRenderCallback/);

    // Positive: the helper really is an accumulate-then-compare loop.
    expect(comparison).toMatch(/difference \|= /);
    expect(comparison).toMatch(/return difference === 0;/);
    expect(comparison).not.toMatch(/===\s*b\b/);

    // And no way out of the loop before the end of it. Line comments are
    // stripped first: the assertion is about the code, and the `biome-ignore`
    // above the accumulator explains at length why an early *return* is what
    // this avoids — prose that would otherwise fail the very check it
    // describes.
    const loop = (
      /for \(let index = 0[\s\S]*?\n {2}\}/.exec(comparison)?.[0] ?? ""
    ).replaceAll(/^\s*\/\/.*$/gm, "");

    expect(loop).toContain("charCodeAt");
    expect(loop).not.toMatch(/\bbreak\b/);
    expect(loop).not.toMatch(/\breturn\b/);
  });

  it("keeps the whole scheme in one constant, so being wrong is a one-line change", async () => {
    /*
     * The three fields together *are* the wire format, and they are pinned as
     * literals rather than compared against themselves: a test that asserted
     * `scheme.header === scheme.header` would pass under every mutation, and a
     * test that built the expected signature from the same constant the
     * implementation reads would pass under a changed algorithm too — which is
     * exactly the trap Task 2 recorded, where signing and verifying change
     * together and nothing notices.
     *
     * `endpoints/render.ts` reads the header name from here rather than
     * repeating it, so changing this constant moves the endpoint with it.
     */
    expect(RENDER_SIGNATURE_SCHEME).toEqual({
      algorithm: "SHA-512",
      header: "x-remotion-signature",
      prefix: "sha512=",
    });

    // And the active scheme really is the one the default argument uses: the
    // same call spelled out explicitly produces the identical signature.
    expect(await signRenderCallback(BODY, SECRET)).toBe(
      await signRenderCallback(BODY, SECRET, RENDER_SIGNATURE_SCHEME)
    );
  });

  it("is Remotion Lambda's HMAC-SHA-512, by a published known-answer vector", async () => {
    /*
     * HMAC-SHA-512 of the published message under the published key,
     * confirmed against OpenSSL rather than against this module — and signed
     * with the *default* scheme, so this pins what the endpoint verifies
     * today, not merely a scheme this module can be asked for.
     */
    expect(
      await signRenderCallback(
        "The quick brown fox jumps over the lazy dog",
        "key"
      )
    ).toBe(
      "sha512=b42af09057bac1e2d41708e48a902e09b5ff7f12ab428a4fe86653c73dd248fb82f948a549f7b791a5b41915ee4d1ec3935357e4e2317250d0372afa2ebeeb3a"
    );

    // The same vector through Remotion's own construction, so the transcription
    // above is held to the published answer too.
    expect(
      remotionSignature("The quick brown fox jumps over the lazy dog", "key")
    ).toBe(
      await signRenderCallback(
        "The quick brown fox jumps over the lazy dog",
        "key"
      )
    );
  });

  it("verifies what Remotion Lambda signs, over the body Remotion posts", async () => {
    /*
     * A webhook body in the shape `@remotion/serverless@4.0.484`'s
     * `dist/handlers/launch.js` builds for a finished render, in its key
     * order, signed the way `calculateSignature` signs it. Non-ASCII in the
     * error text on purpose: the HMAC is over UTF-8 bytes on both sides, and a
     * verifier that hashed UTF-16 code units would pass every ASCII fixture.
     */
    const body = JSON.stringify({
      type: "success",
      renderId: "8l1xk2p3qz",
      expectedBucketOwner: "123456789012",
      bucketName: "remotionlambda-eucentral1-abcdef1234",
      customData: { jobId: "0b8f6c1e-4a57-4d7a-9a55-3f2c9d1e7b10" },
      outputUrl:
        "https://s3.eu-central-1.amazonaws.com/remotionlambda-eucentral1-abcdef1234/renders/8l1xk2p3qz/out.mp4",
      lambdaErrors: [{ message: "Überschreitung — retried" }],
      outputFile:
        "https://s3.eu-central-1.amazonaws.com/remotionlambda-eucentral1-abcdef1234/renders/8l1xk2p3qz/out.mp4",
      timeToFinish: 41_234,
      costs: { accruedSoFar: 0.0123, currency: "USD" },
    });
    const header = remotionSignature(body, SECRET);

    expect(await verifyRenderCallback(body, header, SECRET)).toBe(true);
    expect(await signRenderCallback(body, SECRET)).toBe(header);
    // And not under a different secret, so the positive is not a verifier
    // that accepts anything with the right prefix.
    expect(
      await verifyRenderCallback(
        body,
        remotionSignature(body, OTHER_SECRET),
        SECRET
      )
    ).toBe(false);
  });

  it("does not accept one scheme's signature under the other", async () => {
    /*
     * The failure mode this whole arrangement exists for, made visible: a
     * verifier configured for the wrong scheme refuses every genuine callback.
     * Better to see it here, in three assertions, than against a deployed
     * Lambda.
     *
     * All three parts of a scheme are load-bearing, so all three are
     * exercised: the hash (a SHA-256 hex is not a SHA-512 one), the prefix (the
     * right digest with the prefix stripped is still refused), and — by the
     * endpoint reading `scheme.header` — where the value is looked for.
     */
    const sha256 = await signRenderCallback(BODY, SECRET, LEGACY_SHA256_SCHEME);
    const prefixed = await signRenderCallback(BODY, SECRET);

    expect(await verifyRenderCallback(BODY, sha256, SECRET)).toBe(false);
    expect(
      await verifyRenderCallback(BODY, prefixed, SECRET, LEGACY_SHA256_SCHEME)
    ).toBe(false);

    // The digest right and the prefix missing: still refused, because the
    // header value is compared whole.
    expect(
      await verifyRenderCallback(
        BODY,
        prefixed.slice(RENDER_SIGNATURE_SCHEME.prefix.length),
        SECRET
      )
    ).toBe(false);

    // The positive beside the three negatives: each scheme accepts its own.
    expect(
      await verifyRenderCallback(BODY, sha256, SECRET, LEGACY_SHA256_SCHEME)
    ).toBe(true);
    expect(await verifyRenderCallback(BODY, prefixed, SECRET)).toBe(true);
  });

  it("still signs the legacy SHA-256 HMAC correctly, so a length-extension does not forge one", async () => {
    /*
     * A published known-answer vector, not a self-consistency check: this
     * exact pair is what HMAC-SHA-256 produces for that key and message, so
     * it pins the construction, the hash and the hex encoding at once.
     *
     * `SHA-256(secret || body)` would satisfy every other test in this file
     * while being forgeable without the secret — SHA-256 is Merkle–Damgård,
     * so a valid pair yields a signature for `body || padding || anything`.
     * Here that suffix is a second `outputUrl`, which is precisely the
     * video swap this signature exists to prevent.
     */
    expect(
      await signRenderCallback(
        "The quick brown fox jumps over the lazy dog",
        "key",
        LEGACY_SHA256_SCHEME
      )
    ).toBe("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");

    // The secret participates, which a plain digest of the body would not.
    expect(await signRenderCallback(BODY, SECRET)).not.toBe(
      await signRenderCallback(BODY, OTHER_SECRET)
    );
  });
});
