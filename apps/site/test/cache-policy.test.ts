import { describe, expect, it } from "vitest";
import headersFile from "../public/_headers?raw";
import {
  cacheControlFor,
  cacheHeaders,
  HASHED_EXTENSIONS,
  IMMUTABLE,
  NO_CACHE,
  NO_STORE,
  ONE_DAY,
  ONE_HOUR,
} from "../src/worker/cache";
import { withSecurityHeaders } from "../src/worker/headers";

const HTML = "text/html; charset=utf-8";

function policy(
  pathname: string,
  { status = 200, type = "" }: { status?: number; type?: string } = {}
): string | undefined {
  return cacheControlFor({ contentType: type, pathname, status });
}

describe("cacheControlFor (P-18), path by path", () => {
  it.each([
    "/assets/index-74SKMWTJ.js",
    "/assets/_id-B1e94W_M.js",
    "/assets/client.DS9vjH_1-CM705sLY.js",
    "/assets/styles-Cx1_a-Zq.css",
    "/assets/inter-latin-wght-normal-BT8aKd2x.woff2",
  ])("%s is immutable for a year", (path) => {
    expect(policy(path)).toBe(IMMUTABLE);
    expect(IMMUTABLE).toBe("public, max-age=31536000, immutable");
  });

  it("does not make the unhashed /assets/logo.svg immutable (R-18): a day", () => {
    expect(policy("/assets/logo.svg")).toBe(ONE_DAY);
    expect(policy("/assets/readme.txt")).toBe(ONE_DAY);
  });

  it("does not make a missing hashed asset immutable", () => {
    expect(
      policy("/assets/index-74SKMWTJ.js", { status: 404 })
    ).toBeUndefined();
  });

  it.each([
    "/brand/logo.svg",
    "/brand/email-logo.png",
    "/icon-192.png",
    "/icon-512.png",
    "/icon-maskable-512.png",
    "/apple-touch-icon.png",
    "/icon.svg",
    "/favicon.ico",
    "/og.png",
  ])("%s is cached for a day", (path) => {
    expect(policy(path)).toBe(ONE_DAY);
    expect(ONE_DAY).toBe("public, max-age=86400");
  });

  it.each(["/robots.txt", "/sitemap.xml", "/manifest.webmanifest"])(
    "%s is cached for an hour",
    (path) => {
      expect(policy(path)).toBe(ONE_HOUR);
      expect(ONE_HOUR).toBe("public, max-age=3600");
    }
  );

  it.each(["/", "/gestures", "/gestures/hond", "/admin", "/sponsor"])(
    "the document %s is private, no-cache",
    (path) => {
      expect(policy(path, { type: HTML })).toBe(NO_CACHE);
    }
  );

  it.each([
    "/_serverFn/abc123",
    "/api/rpc/gestures/list",
    "/api/auth/get-session",
    "/api/health",
    "/api/csp-report",
    "/api/webhooks/mux",
    "/webhooks/mollie",
    "/dev/mail",
  ])("%s is no-store", (path) => {
    expect(policy(path, { type: "application/json" })).toBe(NO_STORE);
  });

  it("makes the maintenance page (a 503 document) no-store, not no-cache", () => {
    expect(policy("/gestures", { status: 503, type: HTML })).toBe(NO_STORE);
  });

  it("leaves a redirect and an unknown file alone", () => {
    expect(policy("/gebaren", { status: 301 })).toBeUndefined();
    expect(policy("/something.bin")).toBeUndefined();
  });
});

describe("cacheHeaders", () => {
  it("reads the path from the request URL", () => {
    const response = new Response("x", { headers: { "content-type": HTML } });
    expect(cacheHeaders("https://smog.test/gestures", response)).toEqual({
      "cache-control": NO_CACHE,
    });
    expect(cacheHeaders("https://smog.test/robots.txt", response)).toEqual({
      "cache-control": ONE_HOUR,
    });
  });

  it("falls back to the content type for a missing or invalid URL", () => {
    const response = new Response("x", { headers: { "content-type": HTML } });
    expect(cacheHeaders(undefined, response)).toEqual({
      "cache-control": NO_CACHE,
    });
    expect(cacheHeaders("not a url", response)).toEqual({
      "cache-control": NO_CACHE,
    });
  });

  it("keeps a Cache-Control the route set", () => {
    const secured = withSecurityHeaders(
      new Response("x", {
        headers: {
          "cache-control": "public, max-age=60",
          "content-type": HTML,
        },
      }),
      {
        environment: "production",
        nonce: "n",
        requestUrl: "https://smog.test/gestures",
      }
    );
    expect(secured.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("applies through withSecurityHeaders to an API response", () => {
    const secured = withSecurityHeaders(
      new Response("{}", { headers: { "content-type": "application/json" } }),
      {
        environment: "production",
        nonce: "n",
        requestUrl: "https://smog.test/api/rpc/gestures/list",
      }
    );
    expect(secured.headers.get("cache-control")).toBe(NO_STORE);
  });
});

/** `_headers` rules: path to Cache-Control. */
function cacheRules(source: string): Map<string, string> {
  const rules = new Map<string, string>();
  let path = "";
  for (const line of source.split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }
    if (line.startsWith(" ")) {
      const [name = "", ...value] = line.split(":");
      if (name.trim().toLowerCase() === "cache-control") {
        rules.set(path, value.join(":").trim());
      }
    } else {
      path = line.trim();
    }
  }
  return rules;
}

describe("public/_headers agrees with the policy", () => {
  const rules = cacheRules(headersFile);

  it("marks hashed output immutable by extension, never a blanket /assets/*", () => {
    expect(rules.has("/assets/*")).toBe(false);
    for (const extension of HASHED_EXTENSIONS) {
      expect(rules.get(`/assets/*.${extension}`)).toBe(IMMUTABLE);
    }
  });

  it("gives every other rule the value cacheControlFor gives its path", () => {
    for (const [path, value] of rules) {
      if (
        path.endsWith("*.js") ||
        path.endsWith("*.css") ||
        path.endsWith("*.woff2")
      ) {
        continue;
      }
      // A splat stands for a file below it.
      const sample = path.replace("*", "sample.svg");
      expect(policy(sample), path).toBe(value);
    }
  });

  it("covers every icon and brand path the Worker policy names a day", () => {
    for (const path of [
      "/assets/logo.svg",
      "/brand/*",
      "/apple-touch-icon.png",
      "/favicon.ico",
      "/icon-192.png",
      "/icon-512.png",
      "/icon-maskable-512.png",
      "/icon.svg",
      "/og.png",
    ]) {
      expect(rules.get(path), path).toBe(ONE_DAY);
    }
  });
});
