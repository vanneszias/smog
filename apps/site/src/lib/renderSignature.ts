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
 *
 * ## Which scheme, and why that is a constant rather than a decision
 *
 * **This could not be settled in the environment Task 4 was written in, and
 * guessing was not an option.** Task 2 chose HMAC-SHA-256 as hex in
 * `X-Render-Signature`. Remotion Lambda's own webhook is *reported* to sign
 * HMAC-SHA-512 as `X-Remotion-Signature: sha512=<hex>`, and that report could
 * not be confirmed: `@remotion/lambda` is not a dependency here — Task 4
 * measured it at **+753.39 KiB gzipped** against 27% of headroom and rejected
 * it — no installed Remotion package mentions the header, and `remotion.dev`
 * is blocked by this environment's egress proxy.
 *
 * Which scheme is right depends on something only Task 6 can observe: whether
 * the submission configures Remotion's built-in webhook, or posts this
 * callback itself. Picking one and hoping produces the worst available
 * failure — a verifier that passes every test in this repository and answers
 * 401 to every real callback, discovered against a deployed Lambda with a
 * render already paid for.
 *
 * So the algorithm, the header name and the value prefix are one exported
 * constant and nothing restates them, and **both candidate schemes are pinned
 * by published known-answer vectors** in `renderSignature.test.ts`. Adopting
 * the other one is an edit to the three fields below, and the test that proves
 * it already exists.
 */

import { equalConstantTime } from "@/lib/constantTime";

const HEX = 16;
const BYTE_HEX_WIDTH = 2;

const encoder = new TextEncoder();

/**
 * A wire format for the signature: which HMAC, which header carries it, and
 * what its value is prefixed with.
 *
 * Not exported, for the reason `lib/mux.ts` gives about its own result type:
 * knip fails `bun release:check` on an exported symbol nothing imports, and
 * every caller either passes the constant or writes an object literal. It is
 * still the contract; it is spelled out in the signatures below instead.
 */
interface RenderSignatureScheme {
  /** The hash inside the HMAC, in Web Crypto's own spelling. */
  algorithm: "SHA-256" | "SHA-512";
  /** Lowercase: `Headers.get` folds case, and this value is compared in tests. */
  header: string;
  /** What precedes the hex, such as `sha512=`. Empty for a bare digest. */
  prefix: string;
}

/**
 * The scheme this application signs and verifies under today.
 *
 * Three fields, one place. `endpoints/render.ts` reads `header` from here
 * rather than repeating the string, so changing this constant moves the
 * endpoint with it — and `renderSignature.test.ts` pins all three as literals,
 * so a change is a deliberate diff rather than a silent drift.
 */
export const RENDER_SIGNATURE_SCHEME: RenderSignatureScheme = {
  algorithm: "SHA-256",
  header: "x-render-signature",
  prefix: "",
};

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) =>
    byte.toString(HEX).padStart(BYTE_HEX_WIDTH, "0")
  ).join("");
}

/**
 * The header value for `body` under `secret`: the scheme's prefix followed by
 * the HMAC as lowercase hex.
 *
 * `scheme` defaults to the configured one, so every existing caller is
 * unchanged. It is a parameter at all so that a scheme this application does
 * not currently use can still be held to a known-answer vector.
 */
export async function signRenderCallback(
  body: string,
  secret: string,
  scheme: RenderSignatureScheme = RENDER_SIGNATURE_SCHEME
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: scheme.algorithm },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));

  return `${scheme.prefix}${toHex(new Uint8Array(signature))}`;
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
  secret: string,
  scheme: RenderSignatureScheme = RENDER_SIGNATURE_SCHEME
): Promise<boolean> {
  if (header === null || header === "" || secret === "") {
    return false;
  }

  return equalConstantTime(
    header,
    await signRenderCallback(body, secret, scheme)
  );
}
