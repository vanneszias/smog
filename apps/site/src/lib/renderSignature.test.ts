/**
 * `node:fs` to read this module's own source — see "compares in constant
 * time" — which the default jsdom environment cannot load.
 *
 * @vitest-environment node
 */

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  signRenderCallback,
  verifyRenderCallback,
} from "@/lib/renderSignature";

/** Stand-ins, never real credentials, and not shaped like any provider's key. */
const SECRET = "render-callback-secret-for-tests-only";
const OTHER_SECRET = "a-different-secret-for-tests-only";

const BODY = JSON.stringify({
  jobId: "render-1234",
  muxPlaybackId: "pb-composed",
  state: "ready",
});

/** The same fields, one value changed — what a forger would want accepted. */
const TAMPERED = JSON.stringify({
  jobId: "render-1234",
  muxPlaybackId: "pb-attacker-controlled",
  state: "ready",
});

/** A sibling module's source, for the assertion that reads one. */
function sourceOf(file: string): Promise<string> {
  return readFile(new URL(`./${file}`, import.meta.url), "utf8");
}

describe("the render callback signature", () => {
  it("accepts a body signed with the shared secret", async () => {
    const signature = await signRenderCallback(BODY, SECRET);

    expect(await verifyRenderCallback(BODY, signature, SECRET)).toBe(true);
    // The shape the endpoint and anything that signs for it must agree on:
    // 32 bytes of HMAC-SHA-256 as lowercase hex.
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a body that was altered after signing", async () => {
    // The whole point: the playback id in the body decides which video a
    // public page plays, so a body that changed on the way is a different
    // instruction wearing a valid envelope.
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
    expect(forged).toMatch(/^[0-9a-f]{64}$/);
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
    await expect(verifyRenderCallback(BODY, "0".repeat(64), "")).resolves.toBe(
      false
    );

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
    expect(signature).toMatch(/return equalConstantTime\(header, /);
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

  it("is a SHA-256 HMAC, so a length-extension does not forge one", async () => {
    /*
     * A published known-answer vector, not a self-consistency check: this
     * exact pair is what HMAC-SHA-256 produces for that key and message, so
     * it pins the construction, the hash and the hex encoding at once.
     *
     * `SHA-256(secret || body)` would satisfy every other test in this file
     * while being forgeable without the secret — SHA-256 is Merkle–Damgård,
     * so a valid pair yields a signature for `body || padding || anything`.
     * Here that suffix is a second `muxPlaybackId`, which is precisely the
     * video swap this signature exists to prevent.
     */
    expect(
      await signRenderCallback(
        "The quick brown fox jumps over the lazy dog",
        "key"
      )
    ).toBe("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");

    // The secret participates, which a plain digest of the body would not.
    expect(await signRenderCallback(BODY, SECRET)).not.toBe(
      await signRenderCallback(BODY, OTHER_SECRET)
    );
  });
});
