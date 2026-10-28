import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ORIGIN = "http://localhost:5173";

const SCREEN = {
  payload: { name: "screen_view", properties: { path: "/", platform: "web" } },
  type: "track",
};

function relay(
  body: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  return exports.default.fetch(`${ORIGIN}/api/analytics`, {
    body: JSON.stringify(body),
    headers: {
      "cf-connecting-ip": crypto.randomUUID(),
      "content-type": "application/json",
      origin: ORIGIN,
      ...headers,
    },
    method: "POST",
  });
}

describe("POST /api/analytics", () => {
  it("accepts a taxonomy event with 202 (dropped without credentials)", async () => {
    const response = await relay(SCREEN);
    expect(response.status).toBe(202);
  });

  it("rejects a foreign origin with 403", async () => {
    const response = await relay(SCREEN, {
      origin: "https://evil.test",
      "sec-fetch-site": "cross-site",
    });
    expect(response.status).toBe(403);
  });

  it("rejects free text with 400", async () => {
    const response = await relay({
      payload: {
        name: "screen_view",
        properties: { path: "/search?q=hallo", platform: "web" },
      },
      type: "track",
    });
    expect(response.status).toBe(400);
  });

  it("limits each IP with RL_ANALYTICS (429)", async () => {
    // vitest.config.ts runs RL_ANALYTICS at 5 per 60 s.
    const ip = crypto.randomUUID();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: the limit counts requests in order.
      const response = await relay(SCREEN, { "cf-connecting-ip": ip });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([202, 202, 202, 202, 202, 429]);
  });

  it("only takes POST", async () => {
    const response = await exports.default.fetch(`${ORIGIN}/api/analytics`);
    expect(response.status).not.toBe(202);
  });
});
