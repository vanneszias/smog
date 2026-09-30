import type { RateLimiter } from "@smog/rpc";
import { describe, expect, it } from "vitest";
import { limitRender } from "../src/server/in-process-api";

function limiter(success: boolean): RateLimiter & { keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    limit: ({ key }) => {
      keys.push(key);
      return Promise.resolve({ success });
    },
  };
}

function request(ip = "203.0.113.7"): Request {
  return new Request("http://localhost:5173/gestures?q=hond", {
    headers: { "cf-connecting-ip": ip },
  });
}

describe("limitRender (RL_API once per SSR render)", () => {
  it("asks RL_API once per request, keyed like /api/rpc", async () => {
    const api = limiter(true);
    const page = request();
    await expect(limitRender(page, api)).resolves.toBe(true);
    await expect(limitRender(page, api)).resolves.toBe(true);
    expect(api.keys).toEqual(["api:203.0.113.7"]);

    await limitRender(request("198.51.100.2"), api);
    expect(api.keys).toEqual(["api:203.0.113.7", "api:198.51.100.2"]);
  });

  it("reports an exhausted limit, still once per request", async () => {
    const api = limiter(false);
    const page = request();
    await expect(limitRender(page, api)).resolves.toBe(false);
    await expect(limitRender(page, api)).resolves.toBe(false);
    expect(api.keys).toHaveLength(1);
  });
});
