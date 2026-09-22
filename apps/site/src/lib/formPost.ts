import type { PayloadRequest } from "payload";
import { isTrustedOrigin, remainingPad } from "./authFlow";

/**
 * The things every state-changing form POST in this app does before it does
 * anything else.
 *
 * These lived inside `endpoints/auth.ts` until `endpoints/account.ts` needed
 * the same four, and they are shared rather than copied for a reason that is
 * not tidiness: the properties they carry — one answer for every refusal, a
 * timing floor that hides which branch ran, a 403 for a cross-site post — are
 * properties the *set* of endpoints has to have. A second copy is a second
 * place for one of them to quietly stop being true, and the copy is the one
 * nobody re-reads. `endpoints/auth.int.test.ts` and
 * `endpoints/account.int.test.ts` both assert them against real requests, so
 * a change here fails in both files.
 *
 * Deliberately free of a runtime `payload` import — the `PayloadRequest` is a
 * type-only import and erases — so this module stays loadable from the jsdom
 * unit tests that already cover `lib/authFlow.ts`.
 */

/**
 * Reads the submitted form, tolerating a request that has none.
 *
 * `req.formData()` rejects on an empty or unparseable body, and a POST with
 * no body is something a probe does constantly. An empty `FormData` sends it
 * down the ordinary "those credentials are wrong" path instead of a 500.
 */
export async function readForm(req: PayloadRequest): Promise<FormData> {
  /*
   * `PayloadRequest` types `formData` as optional — it is the Fetch `Request`
   * method, and Payload does not promise every host provides it — so the
   * guard is a typecheck requirement as much as a runtime one.
   */
  if (typeof req.formData !== "function") {
    return new FormData();
  }

  try {
    return await req.formData();
  } catch {
    return new FormData();
  }
}

/** One field, as a string, whatever the form actually carried. */
export function field(form: FormData, name: string): string {
  const value = form.get(name);

  return typeof value === "string" ? value : "";
}

/**
 * Holds the response until `AUTH_FLOOR_MS` has passed since `started`.
 *
 * See `lib/authFlow.ts` for the measurements that make this necessary: the
 * unpadded answers separate "registered" from "not registered" in a single
 * request, and on the account endpoints they separate "wrong password" from
 * "locked" while turning a borrowed session into an ~80 ms password oracle.
 */
export async function pad(started: number): Promise<void> {
  /*
   * A loop, not a single `setTimeout`, because a timer may fire *before* the
   * clock agrees it should have. `setTimeout(resolve, 500)` can resolve on a
   * tick where `Date.now() - started` reads 499 — timer scheduling and
   * `Date.now()` are not obliged to round the same way — and the floor then
   * fails to hold by a millisecond.
   *
   * That millisecond is not a security problem on its own; no attacker
   * distinguishes 499 from 500 across a network. It is a correctness problem
   * for the thing the floor *is*: `endpoints/mobileSession.int.test.ts`'s
   * "takes at least the auth floor" asserts exactly what this function
   * claims to guarantee, and it was observed failing at 499 once.
   *
   * **The cause is not established.** Forty paired runs of the old and new
   * shapes both held 500 with nothing under, so the early-timer hypothesis
   * above is unproven — and there is a second candidate this loop would not
   * fix at all: the assertion compares `Date.now()` in the test process
   * against padding performed inside a miniflare worker, and two processes
   * are not obliged to read the same millisecond. If the failure recurs,
   * that is the answer and the fix belongs in the test, which cannot
   * meaningfully assert an exact cross-process wall-clock bound.
   *
   * This loop stays regardless: it can only ever wait longer, never shorter,
   * and it makes the guarantee unconditional on this side of the boundary.
   */
  let wait = remainingPad(Date.now() - started);

  while (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
    wait = remainingPad(Date.now() - started);
  }
}

/** 403 for a cross-site POST. Not a redirect: nothing here should be retried. */
function crossSite(): Response {
  return new Response("Cross-site request refused.", {
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" },
    status: 403,
  });
}

/** {@link crossSite} when the POST did not come from this site, else `null`. */
export function guardOrigin(req: PayloadRequest): null | Response {
  const trusted = isTrustedOrigin({
    origin: req.headers.get("origin"),
    requestOrigin: req.origin ?? "",
  });

  return trusted ? null : crossSite();
}
