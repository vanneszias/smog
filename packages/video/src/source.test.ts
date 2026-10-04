import { describe, expect, it } from "bun:test";
import { firstReachable, renditionUrls } from "./source";

describe("renditionUrls", () => {
  it("lists highest.mp4, then high.mp4", () => {
    expect(renditionUrls("abc123")).toEqual([
      "https://stream.mux.com/abc123/highest.mp4",
      "https://stream.mux.com/abc123/high.mp4",
    ]);
  });

  it("encodes the playback id", () => {
    expect(renditionUrls("a/b")[0]).toBe(
      "https://stream.mux.com/a%2Fb/highest.mp4"
    );
  });
});

describe("firstReachable", () => {
  function fakeFetch(answers: Record<string, number | Error>) {
    const calls: { method: string; url: string }[] = [];
    const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      calls.push({ method: request.method, url: request.url });
      const answer = answers[request.url] ?? 404;
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(new Response(null, { status: answer }));
    };
    return { calls, fetch };
  }

  const [highest, high] = renditionUrls("pb") as [string, string];

  it("returns the first URL that answers HEAD with 200", async () => {
    const { calls, fetch } = fakeFetch({ [highest]: 200, [high]: 200 });
    expect(await firstReachable([highest, high], fetch)).toBe(highest);
    expect(calls).toEqual([{ method: "HEAD", url: highest }]);
  });

  it("falls through a 404 and a network error", async () => {
    const missing = fakeFetch({ [high]: 200 });
    expect(await firstReachable([highest, high], missing.fetch)).toBe(high);
    const broken = fakeFetch({ [highest]: new Error("reset"), [high]: 200 });
    expect(await firstReachable([highest, high], broken.fetch)).toBe(high);
  });

  it("is null when none answers 200", async () => {
    const { fetch } = fakeFetch({ [highest]: 412, [high]: 500 });
    expect(await firstReachable([highest, high], fetch)).toBeNull();
    expect(await firstReachable([], fetch)).toBeNull();
  });
});
