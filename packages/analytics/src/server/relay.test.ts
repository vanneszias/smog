import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { handleAnalyticsRelay, type RelayOptions } from "./relay";

const SITE = "https://smog.test";

const TRACK = {
  payload: {
    name: "screen_view",
    profileId: "user-1",
    properties: { path: "/lists/$token", platform: "web" },
  },
  type: "track",
};

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${SITE}/api/analytics`, {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      "cf-connecting-ip": "198.51.100.7",
      "content-type": "application/json",
      origin: SITE,
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0 Test",
      ...headers,
    },
    method: "POST",
  });
}

interface Setup {
  fetch: ReturnType<typeof mock>;
  limitKeys: string[];
  options: RelayOptions;
}

function setup(overrides: Partial<RelayOptions> = {}): Setup {
  const limitKeys: string[] = [];
  const fetch = mock(() =>
    Promise.resolve(new Response(null, { status: 202 }))
  );
  return {
    fetch,
    limitKeys,
    options: {
      env: {
        OPENPANEL_API_URL: "https://analytics.example/api",
        OPENPANEL_CLIENT_ID: "client-id",
        OPENPANEL_CLIENT_SECRET: "client-secret",
      },
      fetch: fetch as unknown as typeof globalThis.fetch,
      isForeign: (request) => request.headers.get("origin") !== SITE,
      limit: (key) => {
        limitKeys.push(key);
        return Promise.resolve(true);
      },
      ...overrides,
    },
  };
}

let warn: ReturnType<typeof spyOn>;
let error: ReturnType<typeof spyOn>;
beforeEach(() => {
  warn = spyOn(console, "warn").mockImplementation(() => undefined);
  error = spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

describe("handleAnalyticsRelay", () => {
  test("forwards a valid event to OpenPanel with the secret headers", async () => {
    const { fetch, limitKeys, options } = setup();
    const response = await handleAnalyticsRelay(post(TRACK), options);
    expect(response.status).toBe(202);
    expect(limitKeys).toEqual(["analytics:198.51.100.7"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://analytics.example/api/track");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("openpanel-client-id")).toBe("client-id");
    expect(headers.get("openpanel-client-secret")).toBe("client-secret");
    expect(headers.get("x-client-ip")).toBe("198.51.100.7");
    expect(headers.get("user-agent")).toBe("Mozilla/5.0 Test");
    expect(headers.get("content-type")).toBe("application/json");
    // OpenPanel reads a screen's path from `__path`.
    expect(JSON.parse(String(init.body))).toEqual({
      payload: {
        name: "screen_view",
        profileId: "user-1",
        properties: { __path: "/lists/$token", platform: "web" },
      },
      type: "track",
    });
  });

  test("403 for a foreign origin, before the limit or OpenPanel", async () => {
    const { fetch, limitKeys, options } = setup();
    const response = await handleAnalyticsRelay(
      post(TRACK, {
        origin: "https://evil.test",
        "sec-fetch-site": "cross-site",
      }),
      options
    );
    expect(response.status).toBe(403);
    expect(limitKeys).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("429 over the limit", async () => {
    const { fetch, options } = setup({ limit: () => Promise.resolve(false) });
    const response = await handleAnalyticsRelay(post(TRACK), options);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("400 for an unknown event, free text or a broken body", async () => {
    const { fetch, options } = setup();
    const bodies = [
      { payload: { name: "page_scrolled", properties: {} }, type: "track" },
      {
        payload: {
          name: "search_performed",
          properties: {
            category_count: 0,
            has_results: true,
            platform: "web",
            query: "hallo",
            query_length: 5,
            result_count: 1,
            source: "submit",
          },
        },
        type: "track",
      },
      { payload: { profileId: "a@b.be" }, type: "identify" },
      "{not json",
    ];
    for (const body of bodies) {
      // biome-ignore lint/performance/noAwaitInLoops: one request at a time keeps the assertions readable.
      const response = await handleAnalyticsRelay(post(body), options);
      expect(response.status).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  test("413 for a declared content-length over 4 KB, without reading the body", async () => {
    const { fetch, options } = setup();
    let pulled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull: (controller) => {
          pulled = true;
          controller.enqueue(new TextEncoder().encode(JSON.stringify(TRACK)));
          controller.close();
        },
      },
      { highWaterMark: 0 }
    );
    const request = new Request(`${SITE}/api/analytics`, {
      body,
      duplex: "half",
      headers: {
        "cf-connecting-ip": "198.51.100.7",
        "content-length": "100000",
        "content-type": "application/json",
        origin: SITE,
      },
      method: "POST",
    } as RequestInit);
    const response = await handleAnalyticsRelay(request, options);
    expect(response.status).toBe(413);
    expect(pulled).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("400 for a non-numeric content-length", async () => {
    const { options } = setup();
    const response = await handleAnalyticsRelay(
      post(TRACK, { "content-length": "lots" }),
      options
    );
    expect([400, 413]).toContain(response.status);
  });

  test("413 for a chunked body past 4 KB: the read stops at the cap", async () => {
    const { fetch, options } = setup();
    let chunks = 0;
    let cancelled = false;
    // An endless stream: the handler only returns if it stops reading.
    const body = new ReadableStream<Uint8Array>({
      cancel: () => {
        cancelled = true;
      },
      pull: (controller) => {
        chunks += 1;
        controller.enqueue(new Uint8Array(1024).fill(32));
      },
    });
    const request = new Request(`${SITE}/api/analytics`, {
      body,
      duplex: "half",
      headers: {
        "cf-connecting-ip": "198.51.100.7",
        "content-type": "application/json",
        origin: SITE,
      },
      method: "POST",
    } as RequestInit);
    const response = await handleAnalyticsRelay(request, options);
    expect(response.status).toBe(413);
    expect(chunks).toBeLessThanOrEqual(6);
    expect(cancelled).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("without cf-connecting-ip no x-client-ip is forwarded", async () => {
    const { fetch, options } = setup();
    const request = post(TRACK);
    request.headers.delete("cf-connecting-ip");
    const response = await handleAnalyticsRelay(request, options);
    expect(response.status).toBe(202);
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).has("x-client-ip")).toBe(false);
  });

  test("202 when OpenPanel fails or is unreachable", async () => {
    for (const failing of [
      () => Promise.resolve(new Response("down", { status: 500 })),
      () => Promise.reject(new Error("unreachable")),
    ]) {
      const { options } = setup({
        fetch: mock(failing) as unknown as typeof globalThis.fetch,
      });
      // biome-ignore lint/performance/noAwaitInLoops: sequential on purpose.
      const response = await handleAnalyticsRelay(post(TRACK), options);
      expect(response.status).toBe(202);
    }
    expect(error).toHaveBeenCalled();
    expect(String(error.mock.calls[0]?.[0])).toStartWith("[analytics]");
  });

  test("202 when the rate limiter itself fails", async () => {
    const { fetch, options } = setup({
      limit: () => Promise.reject(new Error("binding down")),
    });
    const response = await handleAnalyticsRelay(post(TRACK), options);
    expect(response.status).toBe(202);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("skips with a warning when the credentials are unset", async () => {
    const { fetch, options } = setup({
      env: { OPENPANEL_API_URL: "https://analytics.example/api" },
    });
    const response = await handleAnalyticsRelay(post(TRACK), options);
    expect(response.status).toBe(202);
    expect(fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toStartWith("[analytics]");
  });

  test("hands the forward to waitUntil when given", async () => {
    const pending: Promise<unknown>[] = [];
    const { fetch, options } = setup({
      waitUntil: (promise) => {
        pending.push(promise);
      },
    });
    const response = await handleAnalyticsRelay(post(TRACK), options);
    expect(response.status).toBe(202);
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("identify forwards the user id only", async () => {
    const { fetch, options } = setup();
    const identify = {
      payload: {
        profileId: "user-1",
        properties: { auth_mode: "authenticated", platform: "web" },
      },
      type: "identify",
    };
    const response = await handleAnalyticsRelay(post(identify), options);
    expect(response.status).toBe(202);
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual(identify);
  });
});
