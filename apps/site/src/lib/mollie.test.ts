import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMolliePayment,
  MollieRefusedError,
  readMolliePayment,
} from "./mollie";

// A stand-in, never a real credential. Every test stubs `fetch`, so nothing
// here ever reaches Mollie. It is deliberately not shaped like a Mollie key
// (`live_…` / `test_…`) so that a secret scanner has nothing to flag.
const STUB_KEY = "stub-key-for-tests-only";

// Read and restored through `process.env.MOLLIE_API_KEY` on every line that
// mentions it, so that the leak check stays exact:
//   grep -rn "MOLLIE_API_KEY" apps/site/src | grep -v "process.env.MOLLIE_API_KEY"
// must print nothing. See the note in `mollie.ts`.
const ORIGINAL_KEY = process.env.MOLLIE_API_KEY;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function htmlResponse(status = 200): Response {
  return new Response(
    "<!doctype html><html><body><h1>502 Bad Gateway</h1></body></html>",
    { headers: { "content-type": "text/html" }, status }
  );
}

function stubFetch(...responses: Response[]): ReturnType<typeof vi.fn> {
  const mock = vi.fn();

  for (const response of responses) {
    mock.mockResolvedValueOnce(response);
  }

  vi.stubGlobal("fetch", mock);

  return mock;
}

const PAID_PAYMENT = {
  amount: { currency: "EUR", value: "60.00" },
  id: "tr_stub",
  metadata: { sponsorshipIds: '["1","2"]' },
  status: "paid",
};

function createdPayment(id = "tr_stub"): Record<string, unknown> {
  return {
    _links: { checkout: { href: "https://www.mollie.com/checkout/stub" } },
    id,
    status: "open",
  };
}

const VALID_INPUT = {
  amountCents: 6000,
  description: "Sponsorship for 1 gesture",
  redirectUrl: "https://example.test/sponsor/success",
  sponsorshipIds: ["1"],
};

function requestOf(mock: ReturnType<typeof vi.fn>, call = 0) {
  const [url, init] = mock.mock.calls[call] as [string, RequestInit];
  const headers = (init.headers ?? {}) as Record<string, string>;

  return {
    body: typeof init.body === "string" ? init.body : "",
    headers,
    init,
    url,
  };
}

/**
 * The error a call rejected with, and a loud failure if it did not reject.
 * `rejects.toThrow()` alone is satisfied by any throw; the tests that use
 * this one need the message itself.
 */
async function errorFrom(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (thrown) {
    return thrown as Error;
  }

  throw new Error("Expected the call to reject, but it resolved.");
}

beforeEach(() => {
  process.env.MOLLIE_API_KEY = STUB_KEY;
});

afterEach(() => {
  // Restored to whatever the worker started with. An unset variable comes
  // back as an empty string rather than being deleted, which this module
  // treats identically to absent — see `mollie.ts`'s key guard.
  process.env.MOLLIE_API_KEY = ORIGINAL_KEY ?? "";
  vi.unstubAllGlobals();
});

describe("createMolliePayment", () => {
  it("sends the amount as a two-decimal string in the currency Mollie wants", async () => {
    const mock = stubFetch(jsonResponse(createdPayment()));

    await createMolliePayment({ ...VALID_INPUT, amountCents: 6000 });

    const body = JSON.parse(requestOf(mock).body);

    expect(body.amount).toEqual({ currency: "EUR", value: "60.00" });
  });

  it("keeps the cents when the amount is not a round number of euro", async () => {
    // The two-decimal test above passes just as well if the amount is sent
    // in cents and happens to read as euro; this one does not.
    const mock = stubFetch(jsonResponse(createdPayment()));

    await createMolliePayment({ ...VALID_INPUT, amountCents: 5 });

    expect(JSON.parse(requestOf(mock).body).amount.value).toBe("0.05");
  });

  it("sends the sponsorship ids in metadata, so the webhook can resolve them", async () => {
    const mock = stubFetch(jsonResponse(createdPayment()));

    await createMolliePayment({
      ...VALID_INPUT,
      amountCents: 12_000,
      sponsorshipIds: ["11", "22"],
    });

    const body = JSON.parse(requestOf(mock).body);

    expect(body.metadata).toEqual({ sponsorshipIds: '["11","22"]' });
    // Mollie hands metadata back verbatim on read, so the shape the webhook
    // parses is the shape written here. Asserted as JSON text rather than as
    // an array because Mollie's metadata values are strings.
    expect(JSON.parse(body.metadata.sponsorshipIds)).toEqual(["11", "22"]);
  });

  it("returns the checkout URL and the id Mollie assigned to the payment", async () => {
    stubFetch(jsonResponse(createdPayment("tr_assigned")));

    const payment = await createMolliePayment(VALID_INPUT);

    expect(payment).toEqual({
      checkoutUrl: "https://www.mollie.com/checkout/stub",
      id: "tr_assigned",
    });
  });

  it("asks Mollie to call the webhook when a URL is given, and omits it when not", async () => {
    const withHook = stubFetch(jsonResponse(createdPayment()));

    await createMolliePayment({
      ...VALID_INPUT,
      webhookUrl: "https://example.test/api/webhooks/mollie",
    });

    expect(JSON.parse(requestOf(withHook).body).webhookUrl).toBe(
      "https://example.test/api/webhooks/mollie"
    );

    // The negative half. Mollie refuses a `webhookUrl` it cannot reach, which
    // is every localhost URL, so local development sends none at all — and
    // "none at all" has to mean the key is absent, not present and empty,
    // which Mollie reads as a URL it cannot parse.
    vi.unstubAllGlobals();
    const withoutHook = stubFetch(jsonResponse(createdPayment()));

    await createMolliePayment(VALID_INPUT);

    expect(JSON.parse(requestOf(withoutHook).body)).not.toHaveProperty(
      "webhookUrl"
    );
    expect(requestOf(withoutHook).body).not.toContain("webhookUrl");
  });

  it("throws with Mollie's own detail when the API refuses", async () => {
    stubFetch(
      jsonResponse(
        {
          detail: "The amount is lower than the minimum",
          status: 422,
          title: "Unprocessable Entity",
        },
        422
      )
    );

    await expect(createMolliePayment(VALID_INPUT)).rejects.toThrow(
      /The amount is lower than the minimum/
    );
  });

  it("throws rather than returning a payment when Mollie answers with an error page", async () => {
    // A Cloudflare or Mollie 502 is HTML. `await response.json()` throws, and
    // a `try` around it that falls back to a default would hand the caller a
    // payment with no id and no checkout URL.
    stubFetch(htmlResponse(502));

    await expect(createMolliePayment(VALID_INPUT)).rejects.toThrow(
      /non-JSON body/i
    );
  });

  it("throws when Mollie answers 200 without a checkout link", async () => {
    stubFetch(jsonResponse({ id: "tr_stub", status: "open" }));

    await expect(createMolliePayment(VALID_INPUT)).rejects.toThrow(
      /checkout URL/i
    );
  });

  it("refuses an amount that is not a positive whole number of cents", async () => {
    const mock = stubFetch(jsonResponse(createdPayment()));

    await expect(
      createMolliePayment({ ...VALID_INPUT, amountCents: 0 })
    ).rejects.toThrow();
    await expect(
      createMolliePayment({ ...VALID_INPUT, amountCents: -5000 })
    ).rejects.toThrow();
    await expect(
      createMolliePayment({ ...VALID_INPUT, amountCents: 49.000_000_000_000_1 })
    ).rejects.toThrow();

    // The assertion that makes the three above mean something: none of them
    // reached Mollie. A guard that threw only after sending the request would
    // still have charged somebody.
    expect(mock).not.toHaveBeenCalled();
  });

  it("refuses a payment that names no sponsorship", async () => {
    // The webhook resolves what to advance from this list alone. An empty one
    // is a payment nothing will ever be credited to.
    const mock = stubFetch(jsonResponse(createdPayment()));

    await expect(
      createMolliePayment({ ...VALID_INPUT, sponsorshipIds: [] })
    ).rejects.toThrow(/sponsorship/i);
    expect(mock).not.toHaveBeenCalled();
  });

  it("refuses to build a payment when the API key is not configured", async () => {
    process.env.MOLLIE_API_KEY = "";
    const mock = stubFetch(jsonResponse(createdPayment()));

    await expect(createMolliePayment(VALID_INPUT)).rejects.toThrow(/api key/i);
    expect(mock).not.toHaveBeenCalled();
  });

  it("does not put the API key anywhere but the Authorization header", async () => {
    const mock = stubFetch(jsonResponse(createdPayment()));

    await createMolliePayment(VALID_INPUT);

    const { body, headers, url } = requestOf(mock);

    // Positive: the key is sent, and sent as a bearer credential. Without
    // this the three refusals below are satisfied by never sending it at all.
    expect(headers.Authorization).toBe(`Bearer ${STUB_KEY}`);

    expect(url).not.toContain(STUB_KEY);
    expect(body).not.toContain(STUB_KEY);

    for (const [name, value] of Object.entries(headers)) {
      if (name !== "Authorization") {
        expect(value).not.toContain(STUB_KEY);
      }
    }
  });

  it("does not name the API key in the error it throws when Mollie refuses", async () => {
    stubFetch(jsonResponse({ detail: "Unauthorized", status: 401 }, 401));

    const error = await errorFrom(createMolliePayment(VALID_INPUT));

    // Positive first: the message says what Mollie said, so this pair cannot
    // be satisfied by an error that carries no message at all.
    expect(error.message).toContain("Unauthorized");
    expect(error.message).not.toContain(STUB_KEY);
  });

  it("gives mollieRequest's fetch a signal that will abort a call which never answers", async () => {
    // Workers `fetch` has no default timeout, and a call that never answers
    // holds the checkout or webhook request that made it open until the
    // client or the platform gives up. See `REQUEST_TIMEOUT_MS` in
    // `mollie.ts`.
    const mock = stubFetch(jsonResponse(createdPayment()));

    await createMolliePayment(VALID_INPUT);

    const { init } = requestOf(mock);

    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it("rejects to its caller when the Mollie call times out, rather than resolving", async () => {
    // Pinning the rejection only, not a message the code does not produce:
    // the timeout is `fetch` throwing, which `mollieRequest` does not catch.
    const mock = vi
      .fn()
      .mockRejectedValueOnce(
        new DOMException("The operation timed out.", "TimeoutError")
      );

    vi.stubGlobal("fetch", mock);

    await expect(createMolliePayment(VALID_INPUT)).rejects.toThrow();
  });
});

describe("readMolliePayment", () => {
  it("reads a payment's status and amount back", async () => {
    stubFetch(jsonResponse(PAID_PAYMENT));

    const payment = await readMolliePayment("tr_stub");

    expect(payment.status).toBe("paid");
    expect(payment.amountCents).toBe(6000);
    expect(payment.currency).toBe("EUR");
  });

  it("returns the metadata Mollie holds, so the webhook can resolve the rows", async () => {
    stubFetch(jsonResponse(PAID_PAYMENT));

    const payment = await readMolliePayment("tr_stub");

    expect(payment.metadata).toEqual({ sponsorshipIds: '["1","2"]' });
  });

  it("returns an empty metadata object when Mollie holds none", async () => {
    stubFetch(jsonResponse({ ...PAID_PAYMENT, metadata: null }));

    const payment = await readMolliePayment("tr_stub");

    expect(payment.metadata).toEqual({});
  });

  it("asks Mollie for the payment by id, with the key in the Authorization header", async () => {
    const mock = stubFetch(jsonResponse(PAID_PAYMENT));

    await readMolliePayment("tr_stub");

    const { headers, init, url } = requestOf(mock);

    expect(url).toBe("https://api.mollie.com/v2/payments/tr_stub");
    expect(init.method ?? "GET").toBe("GET");
    expect(headers.Authorization).toBe(`Bearer ${STUB_KEY}`);
    expect(url).not.toContain(STUB_KEY);
  });

  it("escapes the payment id rather than pasting it into the URL", async () => {
    // The id arrives in an unauthenticated webhook body. Anyone can send
    // `../organizations/me`.
    const mock = stubFetch(jsonResponse(PAID_PAYMENT));

    await readMolliePayment("../organizations/me");

    expect(requestOf(mock).url).toBe(
      "https://api.mollie.com/v2/payments/..%2Forganizations%2Fme"
    );
  });

  it("treats a non-JSON body as a failure rather than as a paid payment", async () => {
    // The one that matters most. A Cloudflare or Mollie error page is HTML,
    // and `await response.json()` throwing inside a `try` that returns a
    // default is exactly how a webhook ends up marking an unpaid sponsorship
    // paid. Note the 200: the status line says nothing is wrong.
    stubFetch(htmlResponse(200));

    await expect(readMolliePayment("tr_stub")).rejects.toThrow(
      /non-JSON body/i
    );
  });

  it("resolves a payment Mollie really did answer with JSON", async () => {
    // The positive beside the negative above: without it, a `readMolliePayment`
    // that rejected unconditionally would pass every refusal test in this file.
    stubFetch(jsonResponse(PAID_PAYMENT));

    await expect(readMolliePayment("tr_stub")).resolves.toMatchObject({
      status: "paid",
    });
  });

  it("carries Mollie's HTTP status on a refusal, so 'no such payment' is not 'Mollie is down'", async () => {
    // `endpoints/mollie.ts` splits on exactly this number. A 404 is a definite
    // answer about an id — answered 200, nothing to retry — and everything
    // else says nothing about the payment and must be retried. Without the
    // status the two are one "it threw", and whichever way that is resolved
    // the webhook is wrong half the time: it either turns into a "does this
    // payment exist" oracle or silently drops a real payment during an outage.
    for (const status of [404, 429, 503] as const) {
      stubFetch(jsonResponse({ detail: "nope", status }, status));

      const error = await readMolliePayment("tr_stub").catch(
        (thrown: unknown) => thrown
      );

      expect(error).toBeInstanceOf(MollieRefusedError);
      expect((error as MollieRefusedError).status).toBe(status);
    }
  });

  it("throws with Mollie's own detail when the payment cannot be read", async () => {
    stubFetch(
      jsonResponse(
        { detail: "No payment exists with token tr_gone", status: 404 },
        404
      )
    );

    await expect(readMolliePayment("tr_gone")).rejects.toThrow(
      /No payment exists with token tr_gone/
    );
  });

  it("refuses a payment whose amount it cannot read as whole cents", async () => {
    // Mollie sends the amount as a decimal *string*, and JavaScript has three
    // different wrong answers for the three ways it can be missing:
    // `Number(undefined)` is NaN, but `Number("")` and `Number(null)` are
    // both **0** — a free sponsorship, which would then match a zero-amount
    // expectation rather than failing. A finiteness check alone catches only
    // the first of the three, which is why the type is checked before the
    // conversion and why all four shapes are listed here.
    const unreadable = [
      { currency: "EUR" },
      { currency: "EUR", value: "" },
      { currency: "EUR", value: null },
      // Present, a string, non-empty, and still not a number.
      { currency: "EUR", value: "fifty euro" },
      // No currency: nothing says these cents are euro cents, so there is
      // nothing to compare the sponsorship's amount against.
      { value: "60.00" },
    ];

    for (const amount of unreadable) {
      vi.unstubAllGlobals();
      stubFetch(jsonResponse({ ...PAID_PAYMENT, amount }));

      await expect(readMolliePayment("tr_stub")).rejects.toThrow(/amount/i);
    }
  });

  it("refuses a payment with no status rather than defaulting to one", async () => {
    stubFetch(jsonResponse({ ...PAID_PAYMENT, status: undefined }));

    await expect(readMolliePayment("tr_stub")).rejects.toThrow(/status/i);
  });

  it("refuses to read a payment when the API key is not configured", async () => {
    process.env.MOLLIE_API_KEY = "";
    const mock = stubFetch(jsonResponse(PAID_PAYMENT));

    await expect(readMolliePayment("tr_stub")).rejects.toThrow(/api key/i);
    expect(mock).not.toHaveBeenCalled();
  });

  it("does not name the API key in the error it throws", async () => {
    stubFetch(jsonResponse({ detail: "Unauthorized", status: 401 }, 401));

    const error = await errorFrom(readMolliePayment("tr_stub"));

    expect(error.message).toContain("Unauthorized");
    expect(error.message).not.toContain(STUB_KEY);
  });
});
