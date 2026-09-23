import { describe, expect, it } from "vitest";
import { resolveSiteOrigin } from "./siteOrigin";

const origin = (
  configured: string | undefined,
  headers: Record<string, string> = {}
): string | undefined =>
  resolveSiteOrigin(configured, new Headers(headers))?.toString();

describe("resolveSiteOrigin", () => {
  it("prefers the configured origin over whatever host the request names", () => {
    expect(
      origin("https://smog-site-production.vanneszias.workers.dev", {
        host: "evil.example",
      })
    ).toBe("https://smog-site-production.vanneszias.workers.dev/");
  });

  it("keeps only the origin of a configured value with a path", () => {
    expect(origin("https://smog.example/nl/")).toBe("https://smog.example/");
  });

  it("treats a blank configured value as unset", () => {
    expect(origin("  ", { host: "localhost:3003" })).toBe(
      "http://localhost:3003/"
    );
  });

  it("uses http for a loopback host and https for any other", () => {
    expect(origin(undefined, { host: "localhost:3003" })).toBe(
      "http://localhost:3003/"
    );
    expect(origin(undefined, { host: "127.0.0.1:8787" })).toBe(
      "http://127.0.0.1:8787/"
    );
    expect(origin(undefined, { host: "preview.example" })).toBe(
      "https://preview.example/"
    );
  });

  it("believes a proxy's forwarded host and scheme", () => {
    expect(
      origin(undefined, {
        host: "internal:3000",
        "x-forwarded-host": "smog.example",
        "x-forwarded-proto": "https, http",
      })
    ).toBe("https://smog.example/");
  });

  it("ignores a forwarded scheme that is not http or https", () => {
    expect(
      origin(undefined, { host: "smog.example", "x-forwarded-proto": "ftp" })
    ).toBe("https://smog.example/");
  });

  it("answers undefined rather than throwing when nothing usable is there", () => {
    expect(origin(undefined)).toBeUndefined();
    expect(origin("not a url")).toBeUndefined();
    expect(origin(undefined, { host: "bad host" })).toBeUndefined();
  });
});
