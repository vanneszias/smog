/**
 * Compares two strings without leaking where they first differ.
 *
 * ## Why not `===`
 *
 * A byte-by-byte `===` returns as soon as it finds a difference, so how long
 * it takes says how many leading characters were right. Against a check an
 * attacker can run repeatedly and time, that turns guessing a 64-character
 * secret from 16^64 attempts into 16 attempts per character. Whether that is
 * exploitable over a network depends on the secret, the endpoint and the
 * noise; whether it is *necessary* does not, and the cost is one loop.
 *
 * Both callers are security checks on a value an attacker supplies:
 * `endpoints/oauth.ts` compares a `state` cookie against the one Google
 * returned, and `lib/renderSignature.ts` compares an HMAC over a callback body
 * that decides which video a public page plays.
 *
 * ## The two properties, and how they are held
 *
 * Every character is compared, the differences are accumulated with `|=`, and
 * the verdict is read once at the end. **No `break` and no `return` inside the
 * loop** — an early exit is the same leak wearing a loop's clothes, and
 * `renderSignature.test.ts` asserts the absence of both against this file's
 * source rather than by measuring a clock, because a timing measurement in CI
 * fails on a busy machine instead of on a regression.
 *
 * The length check in front is not a leak: the lengths here are fixed and
 * public — 64 hex characters for a signature, 43 for a base64url token — so it
 * says nothing an attacker did not know. Without it a candidate shorter than
 * the expected value would be compared only as far as it goes, and a
 * one-character guess that matched the first character would be accepted.
 *
 * `crypto.subtle.timingSafeEqual` would do the same job and is what workerd
 * offers — but only workerd. Node has its equivalent on `node:crypto`, which
 * does not exist in the Worker, so reaching for either would mean the tests
 * running a different comparison from production. This loop is the one both
 * runtimes agree on.
 */
export function equalConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < a.length; index += 1) {
    // biome-ignore lint/suspicious/noBitwiseOperators: XOR-accumulate is what makes this comparison constant-time. Any formulation the rule would accept — `!==` with an early return, `+=` on a boolean — either short-circuits or branches, which is the property being avoided.
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return difference === 0;
}
