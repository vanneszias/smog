import { createEmailSender } from "@smog/email";
import { createMollie, getPayment } from "@smog/payments";
import { createMux, getAsset } from "@smog/video";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Phase 9 task 8: what the provider clients throw and log never carries
 * request headers (the Mollie key, the Mux token, `Authorization`) or a
 * response body, whatever Mollie or Mux answered.
 */

const MOLLIE_KEY = "live_SecretMollieKey0000000000000000";
const MUX_ID = "mux-token-id-secret";
const MUX_SECRET = "mux-token-secret-value";
const BODY_SECRET = "RESPONSE-BODY-SECRET-a@example.test";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Every string an error or its logs can show. */
function everything(error: unknown, logs: unknown[][]): string {
  const text = error instanceof Error ? `${error.name} ${error.message}` : "";
  return `${text} ${JSON.stringify(error)} ${JSON.stringify(logs)}`;
}

function captureErrors(): unknown[][] {
  const logs: unknown[][] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logs.push(args.map((arg) => (arg instanceof Error ? arg.message : arg)));
  });
  return logs;
}

async function thrownBy(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

const ANSWERS: [string, () => Response][] = [
  ["a 500 with a body", () => new Response(BODY_SECRET, { status: 500 })],
  ["a 200 that is not JSON", () => new Response(BODY_SECRET)],
  [
    "a 200 with an unexpected payment",
    () => Response.json({ id: 1, leaked: BODY_SECRET }),
  ],
  ["a 429", () => new Response(BODY_SECRET, { status: 429 })],
];

describe("provider client errors never carry headers or bodies", () => {
  it.each(ANSWERS)("Mollie: %s", async (_name, answer) => {
    const mollie = createMollie(
      { ENVIRONMENT: "production", MOLLIE_API_KEY: MOLLIE_KEY },
      { fetch: () => Promise.resolve(answer()) }
    );
    if (!mollie) {
      throw new Error("[test] no Mollie client");
    }
    const logs = captureErrors();
    const thrown = await thrownBy(() => getPayment(mollie, "tr_abcd1234"));
    expect(thrown).toBeInstanceOf(Error);
    const text = everything(thrown, logs);
    for (const secret of [MOLLIE_KEY, "Bearer", BODY_SECRET]) {
      expect(text).not.toContain(secret);
    }
  });

  it.each(ANSWERS)("Mux: %s", async (_name, answer) => {
    const mux = createMux(
      {
        ENVIRONMENT: "production",
        MUX_TOKEN_ID: MUX_ID,
        MUX_TOKEN_SECRET: MUX_SECRET,
      },
      { fetch: () => Promise.resolve(answer()) }
    );
    if (!mux) {
      throw new Error("[test] no Mux client");
    }
    const logs = captureErrors();
    const thrown = await thrownBy(() => getAsset(mux, "asset-1"));
    expect(thrown).toBeInstanceOf(Error);
    const text = everything(thrown, logs);
    for (const secret of [
      MUX_ID,
      MUX_SECRET,
      btoa(`${MUX_ID}:${MUX_SECRET}`),
      BODY_SECRET,
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("the email sender's own error names the environment, nothing of a message", () => {
    expect(() =>
      createEmailSender({
        binding: undefined,
        environment: "production",
        kv: {} as KVNamespace,
      })
    ).toThrow(
      "[email] Failed to create a sender: the EMAIL binding is missing in production"
    );
  });
});
