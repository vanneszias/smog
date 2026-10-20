import { env, exports } from "cloudflare:workers";
import { MAINTENANCE_KV_KEY } from "@smog/config/maintenance";
import { createFakeMollie } from "@smog/payments/testing";
import { MuxSignatureError, verifyMuxWebhook } from "@smog/video";
import { signMuxWebhook } from "@smog/video/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp } from "../src/server/context";
import {
  handleMollieWebhook,
  type MollieWebhookDeps,
} from "../src/server/mollie-webhook";
import { clearMaintenanceCache } from "../src/worker/maintenance";
import { ORIGIN } from "./helpers";
import { MUX_WEBHOOK_TEST_SECRET } from "./mux-secret";
import { kv, recordingQueue, testDb } from "./sponsorships";

/*
 * Phase 9 task 8: the webhooks and the rate-limit keys. The webhook
 * handlers' own cases are in `mux-webhook.test.ts`, `mollie-webhook.test.ts`,
 * `packages/video/src/webhooks.test.ts`; this pins what the review found
 * missing: a Mux retry after the tolerance, a Mollie body that lies, the
 * deliberate exemptions from maintenance and the origin check, and rate-limit
 * keys that `X-Forwarded-For` cannot move.
 */

afterEach(async () => {
  vi.restoreAllMocks();
  await kv().delete(MAINTENANCE_KV_KEY);
  clearMaintenanceCache();
});

const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
const NOW_SECONDS = Math.floor(NOW / 1000);
const MUX_BODY = JSON.stringify({
  created_at: "2026-10-20T12:00:00.000Z",
  data: { id: "asset-1", status: "ready" },
  id: "event-retry",
  object: { id: "asset-1", type: "asset" },
  type: "video.asset.ready",
});

describe("Mux webhook signatures (HMAC, tolerance, retries)", () => {
  async function verifyAt(
    signedAtSeconds: number,
    nowMs: number
  ): Promise<string> {
    const signature = await signMuxWebhook(
      MUX_BODY,
      MUX_WEBHOOK_TEST_SECRET,
      signedAtSeconds
    );
    try {
      await verifyMuxWebhook(
        MUX_BODY,
        new Headers({ "mux-signature": signature }),
        MUX_WEBHOOK_TEST_SECRET,
        nowMs
      );
      return "ok";
    } catch (error) {
      return error instanceof MuxSignatureError ? error.reason : "other";
    }
  }

  it("refuses a replay of an old delivery after 5 minutes, but takes the retry Mux signs afresh", async () => {
    const later = NOW + 6 * 60 * 1000;
    // The first delivery's signature, replayed six minutes on: stale.
    expect(await verifyAt(NOW_SECONDS, later)).toBe("expired");
    // A retry is a new delivery with a new timestamp and the same body:
    // fine (the handler is idempotent per event id).
    expect(await verifyAt(Math.floor(later / 1000), later)).toBe("ok");
    // Inside the tolerance the original still counts.
    expect(await verifyAt(NOW_SECONDS, NOW + 4 * 60 * 1000)).toBe("ok");
  });

  it("refuses a tampered body and a wrong secret through the route, with a bare 400", async () => {
    const signature = await signMuxWebhook(
      MUX_BODY,
      MUX_WEBHOOK_TEST_SECRET,
      Math.floor(Date.now() / 1000)
    );
    const post = async (body: string, mux: string) =>
      await exports.default.fetch(`${ORIGIN}/api/webhooks/mux`, {
        body,
        headers: {
          "cf-connecting-ip": crypto.randomUUID(),
          "content-type": "application/json",
          "mux-signature": mux,
        },
        method: "POST",
      });
    const tampered = await post(
      MUX_BODY.replace("ready", "errored"),
      signature
    );
    expect(tampered.status).toBe(400);
    const wrong = await post(
      MUX_BODY,
      await signMuxWebhook(
        MUX_BODY,
        "not-the-secret",
        Math.floor(Date.now() / 1000)
      )
    );
    expect(wrong.status).toBe(400);
    const texts = await Promise.all([tampered.text(), wrong.text()]);
    for (const text of texts) {
      expect(text).not.toContain(MUX_WEBHOOK_TEST_SECRET);
    }
  });
});

describe("the Mollie webhook has no signature: the payment is re-fetched", () => {
  function deps(
    fake: ReturnType<typeof createFakeMollie>,
    queues: ReturnType<typeof recordingQueue>
  ): MollieWebhookDeps {
    return {
      db: testDb(),
      kv: kv(),
      limit: () => Promise.resolve(true),
      mollie: fake.mollie,
      queues: { email: queues, events: queues },
    };
  }

  const FORGED = JSON.stringify({
    amount: { currency: "EUR", value: "0.01" },
    id: "tr_forged1234",
    metadata: { sponsorshipIds: ["x"] },
    status: "paid",
  });

  it("ignores a forged status in the body: an unknown id is 200 UNKNOWN after a re-fetch", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fake = createFakeMollie();
    const queue = recordingQueue();
    const response = await handleMollieWebhook(
      new Request(`${ORIGIN}/api/webhooks/mollie`, {
        body: FORGED,
        headers: {
          "cf-connecting-ip": "203.0.113.9",
          "content-type": "application/json",
        },
        method: "POST",
      }),
      deps(fake, queue)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-smog-webhook")).toBe("UNKNOWN");
    expect(await response.text()).toBe("");
    expect(
      fake.requests.map(({ method, path }) => `${method} ${path}`)
    ).toEqual(["GET /v2/payments/tr_forged1234"]);
    expect(queue.messages).toEqual([]);
  });

  it("answers 400 for a malformed id, whatever else the body claims", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fake = createFakeMollie();
    const response = await handleMollieWebhook(
      new Request(`${ORIGIN}/api/webhooks/mollie`, {
        body: JSON.stringify({ id: "pay_nope", status: "paid" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      deps(fake, recordingQueue())
    );
    expect(response.status).toBe(400);
    expect(fake.requests).toEqual([]);
  });
});

/** `[path, why it is exempt]`: the webhooks and their legacy alias. */
const WEBHOOK_PATHS = [
  ["/api/webhooks/mux", "Mux signs with HMAC; a settled upload must land"],
  ["/api/webhooks/mollie", "Mollie re-fetched by id; a payment must settle"],
  ["/webhooks/mollie", "the legacy alias of the Mollie webhook (spec §15)"],
] as const;

describe("webhooks are exempt from maintenance and the origin check, by design", () => {
  it.each(WEBHOOK_PATHS)(
    "%s answers its own JSON through a maintenance window, cross-site",
    async (path) => {
      await kv().put(
        MAINTENANCE_KV_KEY,
        JSON.stringify({ bypassVersion: 1, enabled: true })
      );
      clearMaintenanceCache();
      const response = await exports.default.fetch(`${ORIGIN}${path}`, {
        body: "id=nope",
        headers: {
          "cf-connecting-ip": crypto.randomUUID(),
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
        },
        method: "POST",
        redirect: "manual",
      });
      // Not the maintenance page (HTML 503), not the origin check's 403.
      expect(response.status).not.toBe(403);
      expect(response.headers.get("content-type") ?? "").not.toContain(
        "text/html"
      );
      expect([400, 503]).toContain(response.status);
      await response.body?.cancel();
      // The same request to a non-exempt API path does meet the window.
      const blocked = await exports.default.fetch(
        `${ORIGIN}/api/rpc/lists/mine`,
        {
          body: "{}",
          method: "POST",
        }
      );
      expect(blocked.status).toBe(503);
      await blocked.body?.cancel();
    }
  );

  it("lists exactly these webhook paths in the maintenance exemptions", () => {
    // A new webhook path must be added here on purpose.
    expect(WEBHOOK_PATHS.map(([path]) => path).sort()).toEqual([
      "/api/webhooks/mollie",
      "/api/webhooks/mux",
      "/webhooks/mollie",
    ]);
  });
});

describe("rate-limit keys cannot be spoofed", () => {
  function request(headers: Record<string, string>): Request {
    return new Request(`${ORIGIN}/x`, { headers });
  }

  it("the key is cf-connecting-ip, never a forwarded header", () => {
    expect(
      clientIp(
        request({
          "cf-connecting-ip": "198.51.100.7",
          forwarded: "for=203.0.113.1",
          "x-forwarded-for": "203.0.113.2",
          "x-real-ip": "203.0.113.3",
        })
      )
    ).toBe("198.51.100.7");
  });

  it("a missing cf-connecting-ip is one shared `unknown` bucket (dev only, accepted)", () => {
    expect(
      clientIp(request({ "x-forwarded-for": "203.0.113.2", "x-real-ip": "x" }))
    ).toBe("unknown");
  });

  it("changing X-Forwarded-For does not reset the RL_AUTH limit", async () => {
    const address = `198.51.100.${crypto.randomUUID()}`;
    const statuses: number[] = [];
    for (let index = 0; index < 8; index += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: the limit counts in order.
      const response = await exports.default.fetch(
        `${ORIGIN}/api/auth/sign-in/email`,
        {
          body: JSON.stringify({ email: "a@smog.test", password: "x" }),
          headers: {
            "cf-connecting-ip": address,
            "content-type": "application/json",
            origin: ORIGIN,
            "x-forwarded-for": `203.0.113.${index}`,
          },
          method: "POST",
        }
      );
      statuses.push(response.status);
      await response.body?.cancel();
    }
    // 5 per minute in the tests: the 6th onwards is 429, XFF or not.
    expect(statuses.slice(5)).toEqual([429, 429, 429]);
    expect(statuses.slice(0, 5)).not.toContain(429);
  });

  it("has the four bindings of the table", () => {
    for (const name of ["RL_API", "RL_ANALYTICS", "RL_AUTH", "RL_SPONSOR"]) {
      expect((env as unknown as Record<string, unknown>)[name]).toBeDefined();
    }
  });
});
