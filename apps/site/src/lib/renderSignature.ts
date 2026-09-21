/**
 * The HMAC over a render callback's body.
 *
 * ## What this protects
 *
 * `POST /api/render/callback` is a public URL that a third party — Remotion
 * Lambda, running in AWS — posts to. It carries a Mux playback id, and what
 * the application does with that playback id is put the video it names on a
 * public page in place of the one that is there. Anyone who can post an
 * accepted body can therefore put any video on any gesture. There is no
 * session, no origin and no source address to lean on: AWS Lambda posts from
 * wherever it likes, with no `Origin` header, exactly as Mollie's webhook
 * does. A shared secret and a signature over the body is the whole of the
 * authentication.
 *
 * That is a different situation from `endpoints/mollie.ts`, and the
 * difference is worth stating because the two look alike. Mollie does not sign
 * its webhooks, so that handler throws the body away except for an id and asks
 * Mollie what the payment is — the body is a hint, never evidence. Here there
 * is nobody to ask back: the render result is only known to the thing that
 * produced it. So the body *is* the evidence, and the signature is what makes
 * it admissible.
 *
 * ## Web Crypto, not `node:crypto`
 *
 * This runs in workerd, where `crypto.subtle` is the API that exists —
 * `endpoints/account.ts` says the same about SHA-256 hashing. Node 24 has the
 * same interface, so the tests exercise this code rather than a substitute.
 *
 * ## HMAC rather than a digest of the secret and the body
 *
 * `SHA-256(secret || body)` is forgeable without knowing the secret: SHA-256
 * is a Merkle–Damgård construction, so from one valid `(body, signature)` pair
 * an attacker can compute the signature for `body || padding || anything`
 * without the secret at all. HMAC exists precisely to close that, and this is
 * a case where an appended suffix would matter — a JSON body with a second
 * `muxPlaybackId` after the padding is exactly the forgery that swaps the
 * video. `renderSignature.test.ts` pins the construction with a published
 * known-answer vector rather than asserting the string "HMAC" appears
 * somewhere.
 */

import { equalConstantTime } from "@/lib/constantTime";

const HEX = 16;
const BYTE_HEX_WIDTH = 2;

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) =>
    byte.toString(HEX).padStart(BYTE_HEX_WIDTH, "0")
  ).join("");
}

/** The HMAC-SHA-256 of `body` under `secret`, as lowercase hex. */
export async function signRenderCallback(
  body: string,
  secret: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));

  return toHex(new Uint8Array(signature));
}

/**
 * Whether `header` is the signature of `body` under `secret`.
 *
 * Refuses an absent or empty header outright: there is nothing to compare, and
 * a caller that treats "no signature" as "fine" has an unauthenticated
 * endpoint with a signature check bolted to the side of it.
 *
 * **An empty secret verifies nothing**, and the reason is narrower than it
 * first looks. Web Crypto refuses a zero-length HMAC key outright — measured,
 * `DataError: Zero-length key is not supported` — so an unset
 * `RENDER_CALLBACK_SECRET` cannot produce a signature that anybody, attacker
 * included, could get accepted. What this guard changes is therefore not
 * whether a misconfigured deployment is exploitable but what it *does*:
 * without it, a blank secret makes this function reject rather than answer,
 * and a caller that expected a boolean answers 500 to every callback while
 * the real fault goes unnamed. It fails closed with a verdict instead.
 */
export async function verifyRenderCallback(
  body: string,
  header: null | string,
  secret: string
): Promise<boolean> {
  if (header === null || header === "" || secret === "") {
    return false;
  }

  return equalConstantTime(header, await signRenderCallback(body, secret));
}
