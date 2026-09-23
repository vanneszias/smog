/**
 * Mollie's Payments API, as two `fetch` calls.
 *
 * **Why not `@mollie/api-client`.** The SDK is 2.1 MB unpacked and this app
 * uses exactly two of its calls, `payments.create` and `payments.get`. Both
 * builds were measured against the same commit rather than estimated:
 *
 * | build | gzipped | delta |
 * |---|---:|---:|
 * | baseline (Stage 5 Task 2) | 7,483.37 KiB | — |
 * | + `@mollie/api-client` reachable from an endpoint | 7,649.08 KiB | **+165.71** |
 * | this module (`fetch`) | 7,483.37 KiB | **0.00** |
 *
 * That is 166 KiB out of the 2.69 MiB left in a 10.00 MiB Worker, which
 * Stages 6 (video) and 7 (email and jobs) still have to fit inside — and the
 * plan's bar was "under 100 KiB gzipped *and* say what it buys". It is over
 * the bar and it buys two URL templates, so: `fetch`. (The 0.00 on the last
 * row is real but temporary: nothing reaches this module from the Worker
 * graph until Task 4 and Task 7 import it.)
 *
 * A second finding from that measurement, worth more than the number:
 * `createMollieClient({ apiKey: "" })` **throws at module evaluation**. The
 * shipped `packages/auth/src/lib/payments.ts` constructs the client at module
 * scope with `process.env.MOLLIE_API_KEY || ""`, so anything that imports it
 * without the variable set dies on import — which is how the probe build
 * failed here, during `next build`'s page-data collection. The functions
 * below read the key per call instead, so an unset key is an error on the one
 * request that needed it rather than a dead Worker.
 *
 * **The secret.** `process.env.MOLLIE_API_KEY` is read on exactly one line of
 * this file and leaves it only as an `Authorization: Bearer` header. It is not
 * interpolated into a URL, a body, a log line or an error message, and this
 * file never logs at all — the callers (Task 4's webhook, Task 7's checkout)
 * do the logging, from messages constructed here that are safe to print. The
 * variable's name is not restated in any string, so that
 *
 *     grep -rn "MOLLIE_API_KEY" apps/site/src | grep -v "process.env.MOLLIE_API_KEY"
 *
 * prints nothing and the single reader is provable rather than asserted.
 */

const MOLLIE_API_BASE = "https://api.mollie.com/v2";
const CENTS_PER_EURO = 100;

/**
 * How long one call to Mollie may take before it is abandoned.
 *
 * Workers `fetch` has no default timeout, and a call that never answers holds
 * the request — or, from a job, the whole queue run — until the platform
 * kills it, which strands every job that run had claimed. Ten seconds is the
 * value `endpoints/oauth.ts` already uses for the same reason.
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * What `createMolliePayment` needs to open a checkout.
 *
 * Not exported, and neither is `MolliePayment` below, although both are part
 * of this module's contract. knip fails the build on an exported symbol
 * nothing imports, and nothing imports these until Task 4's webhook and Task
 * 7's checkout land — a type exported "for later" is precisely what that
 * gate exists to catch. Callers pass an object literal, which is checked
 * against this shape just the same; the `export` keyword goes on at the
 * moment a caller needs to name it.
 */
interface CreateMolliePaymentInput {
  /** The whole order, in euro cents. `lib/pricing.ts` computes it. */
  amountCents: number;
  /** Shown to the sponsor on Mollie's page and on their bank statement. */
  description: string;
  /** Where Mollie returns the sponsor once they are done. */
  redirectUrl: string;
  /** The sponsorship rows this payment pays for. At least one. */
  sponsorshipIds: string[];
  /**
   * Where Mollie announces status changes. Omitted in local development:
   * Mollie refuses a `webhookUrl` it cannot reach, which is every localhost
   * URL, and refusing it fails the whole payment.
   */
  webhookUrl?: string;
}

/** A payment as `readMolliePayment` reports it. */
interface MolliePayment {
  amountCents: number;
  currency: string;
  metadata: Record<string, string>;
  status: string;
}

/**
 * A refusal Mollie itself answered, carrying the HTTP status it answered with.
 *
 * The status is what lets a caller tell an *answer* from a *failure*. Mollie
 * replies 404 to a payment id it does not recognise, and that is a definite
 * statement about that id — there is nothing to retry. A 429, a 503 or a
 * connection that never completed says nothing about the payment, and
 * retrying is the only correct response. `endpoints/mollie.ts` splits exactly
 * there: the first is answered 200, the second 502, and without the status
 * the two collapse into "something went wrong" and Mollie either hammers a
 * dead id forever or silently drops a real payment.
 *
 * The message is unchanged from the plain `Error` this replaces, so it stays
 * the thing a log line prints, and a caller that only cares that it threw is
 * unaffected.
 */
export class MollieRefusedError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MollieRefusedError";
    this.status = status;
  }
}

function apiKeyOrThrow(): string {
  const apiKey = process.env.MOLLIE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "[mollie] The Mollie API key is missing from the environment."
    );
  }

  return apiKey;
}

/**
 * Mollie's answer, parsed, with a non-JSON body treated as a failure.
 *
 * The `try`/`catch` here rethrows; it must never fall back to a default. A
 * Cloudflare or Mollie error page is HTML — sometimes with a 200, as a
 * cached edge response — and `await response.json()` throwing inside a `try`
 * that returns `{}` is exactly how a webhook ends up reading `status:
 * undefined` and, one `!== "failed"` away, marking an unpaid sponsorship
 * paid.
 *
 * The body itself is deliberately not quoted in the error. An intercepting
 * proxy's error page can echo the request that produced it, headers
 * included, and this module's request carries the API key.
 */
async function parseMollieJson(
  response: Response,
  what: string
): Promise<Record<string, unknown>> {
  const text = await response.text();
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `[mollie] ${what} returned a non-JSON body (HTTP ${response.status}, content-type ${response.headers.get("content-type") ?? "unknown"}).`
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `[mollie] ${what} returned a non-JSON body: expected an object (HTTP ${response.status}).`
    );
  }

  return parsed as Record<string, unknown>;
}

/** Mollie's error objects carry `detail`, and fall back to `title`. */
function refusalMessage(body: Record<string, unknown>): string {
  const detail = typeof body.detail === "string" ? body.detail : undefined;
  const title = typeof body.title === "string" ? body.title : undefined;

  return detail ?? title ?? "no detail given";
}

async function mollieRequest(
  url: string,
  what: string,
  init: RequestInit
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  // Parsed before the status is consulted, because Mollie's own explanation
  // of a refusal is in the body. A refusal whose body is an HTML error page
  // fails as a non-JSON body, which is still a throw.
  const body = await parseMollieJson(response, what);

  if (!response.ok) {
    throw new MollieRefusedError(
      `[mollie] ${what} was refused (HTTP ${response.status}): ${refusalMessage(body)}`,
      response.status
    );
  }

  return body;
}

/**
 * Only the string-valued entries, because that is all Mollie's metadata may
 * hold and all the webhook reads. Anything else is dropped rather than
 * coerced: `String(someObject)` would hand the webhook
 * `"[object Object]"` to parse as a sponsorship id list.
 */
function stringMetadata(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  );

  return Object.fromEntries(entries);
}

/**
 * Opens a Mollie checkout for one sponsorship order.
 *
 * The sponsorship ids travel in `metadata.sponsorshipIds` as a JSON array of
 * strings, which is the only thing that lets the webhook work out what a
 * payment paid for — Mollie hands metadata back verbatim on read. The
 * shipped product also sets `isBulkPayment: "true"`; this does not, because
 * `apps/site` writes one sponsorship row per selected gesture, so every
 * payment names a list and a flag that is always true carries no
 * information. Task 4's webhook is the only reader of this metadata and is
 * written against this shape.
 *
 * @throws If the amount is not a positive whole number of cents, if no
 *   sponsorship is named, if the key is unset, or if Mollie refuses,
 *   answers with a non-JSON body, or answers without a checkout URL.
 */
export async function createMolliePayment(
  input: CreateMolliePaymentInput
): Promise<{ checkoutUrl: string; id: string }> {
  // Everything below runs before `fetch`. A guard that threw after the
  // request would already have charged somebody.
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(
      `[mollie] A payment is a positive whole number of cents; got ${input.amountCents}.`
    );
  }

  if (input.sponsorshipIds.length === 0) {
    throw new Error(
      "[mollie] A payment must name at least one sponsorship, or nothing can ever be credited for it."
    );
  }

  const apiKey = apiKeyOrThrow();

  const body = await mollieRequest(
    `${MOLLIE_API_BASE}/payments`,
    "Creating a payment",
    {
      body: JSON.stringify({
        amount: {
          currency: "EUR",
          // Mollie takes a decimal string with exactly two places, not an
          // integer number of cents. `toFixed(2)` is the whole conversion,
          // and the integer guard above is what stops it rounding a
          // fraction into a charge nobody agreed to.
          value: (input.amountCents / CENTS_PER_EURO).toFixed(2),
        },
        description: input.description,
        metadata: { sponsorshipIds: JSON.stringify(input.sponsorshipIds) },
        redirectUrl: input.redirectUrl,
        // Plain, not a conditional spread. `JSON.stringify` drops an
        // `undefined` value, so `{ webhookUrl: undefined }` and omitting the
        // key serialise to the same bytes — a mutation swapping one for the
        // other cannot fail a test, and an unfalsifiable construct reads as a
        // guard without being one. What does matter, and is tested, is that
        // an absent webhook URL is absent rather than empty: Mollie refuses a
        // `webhookUrl` it cannot parse, and refusing it fails the payment.
        webhookUrl: input.webhookUrl,
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    }
  );

  const links = body._links as
    | { checkout?: { href?: unknown } | null }
    | undefined;
  const checkoutUrl = links?.checkout?.href;
  const id = body.id;

  if (typeof id !== "string" || id === "") {
    throw new Error("[mollie] Mollie created a payment with no id.");
  }

  if (typeof checkoutUrl !== "string" || checkoutUrl === "") {
    throw new Error(
      "[mollie] Mollie created a payment with no checkout URL, so the sponsor has nowhere to pay."
    );
  }

  return { checkoutUrl, id };
}

/**
 * Reads a payment back from Mollie.
 *
 * The webhook's body is `id=tr_xxx` from an unauthenticated POST that anyone
 * can send; the only thing that makes acting on it safe is asking Mollie
 * what that payment actually is. So every field this returns is required to
 * be present and well-formed — a missing `status` or an unreadable `amount`
 * is an error, never a default, because a default is a decision about
 * somebody's money made by a typo.
 *
 * @throws If the key is unset, or Mollie refuses, answers with a non-JSON
 *   body, or answers with a payment missing a status or a readable amount.
 */
export async function readMolliePayment(id: string): Promise<MolliePayment> {
  const apiKey = apiKeyOrThrow();

  // Escaped because `id` comes from an unauthenticated request body and is
  // being pasted into a path against an authenticated API.
  const body = await mollieRequest(
    `${MOLLIE_API_BASE}/payments/${encodeURIComponent(id)}`,
    "Reading a payment",
    { headers: { Authorization: `Bearer ${apiKey}` }, method: "GET" }
  );

  const status = body.status;

  if (typeof status !== "string" || status === "") {
    throw new Error("[mollie] Mollie returned a payment with no status.");
  }

  const amount = body.amount as
    | { currency?: unknown; value?: unknown }
    | undefined;
  const currency = amount?.currency;
  const value = amount?.value;

  // Checked as a *non-empty* string before the conversion, not merely
  // narrowed afterwards. `Number(undefined)` is NaN, which a finiteness check
  // catches — but `Number("")` and `Number(null)` are both 0, and a zero
  // amount is not a failure, it is a free sponsorship that goes on to match a
  // zero-amount expectation. A finiteness check alone catches one of the
  // three. (This was written as a bare `typeof` check first; the test that
  // lists all three shapes is what caught it.)
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    typeof currency !== "string" ||
    currency === ""
  ) {
    throw new Error(
      "[mollie] Mollie returned a payment with no readable amount."
    );
  }

  const euro = Number(value);

  if (!Number.isFinite(euro)) {
    throw new Error(
      `[mollie] Mollie returned a payment with an unreadable amount: ${value}.`
    );
  }

  const amountCents = Math.round(euro * CENTS_PER_EURO);

  return {
    amountCents,
    currency,
    metadata: stringMetadata(body.metadata),
    status,
  };
}
