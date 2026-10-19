import { exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { SYSTEM_THEME_SCRIPT } from "../src/lib/preferences";
import {
  buildCsp,
  r2ConnectSources,
  reportingEndpoints,
  respondSecurely,
  THEME_SCRIPT_HASH,
  withSecurityHeaders,
} from "../src/worker/headers";

const ORIGIN = "http://localhost:5173";
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
const NONCE_ATTR = /\bnonce="([^"]+)"/;
const NONCE_SOURCE = /'nonce-([^']+)'/;
const DATA_BLOCK = /\btype="application\/(?:ld\+)?json"/;
const REFERRER_META =
  /<meta(?=[^>]*name="referrer")(?=[^>]*content="no-referrer")/;

async function sha256Base64(source: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source)
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

function fetchSite(path: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(`${ORIGIN}${path}`, init);
}

describe("the CSP", () => {
  it("has the brief's directives, the theme hash and the nonce", () => {
    const csp = buildCsp("abc123");
    expect(csp).toBe(
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-abc123' 'sha256-${THEME_SCRIPT_HASH}' https://challenges.cloudflare.com`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://image.mux.com https://lh3.googleusercontent.com",
        "media-src 'self' blob: https://stream.mux.com https://*.mux.com",
        "connect-src 'self' https://*.mux.com https://inferred.litix.io",
        "frame-src https://challenges.cloudflare.com",
        "worker-src 'self' blob:",
        "font-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "report-uri /api/csp-report",
        "report-to csp",
      ].join("; ")
    );
  });

  it("reports to the same-origin endpoint (phase 8 ruling 11)", () => {
    expect(buildCsp("n")).toContain(
      "; report-uri /api/csp-report; report-to csp"
    );
    expect(reportingEndpoints("https://smog.example")).toBe(
      'csp="https://smog.example/api/csp-report"'
    );
    // Only the origin of the request's URL.
    expect(reportingEndpoints("http://localhost:5173/x?y")).toBe(
      'csp="http://localhost:5173/api/csp-report"'
    );
    for (const invalid of [undefined, "", "not a url", "javascript:alert(1)"]) {
      expect(reportingEndpoints(invalid)).toBeNull();
    }
  });

  it("hashes the exact theme pre-paint script the page inlines", async () => {
    expect(THEME_SCRIPT_HASH).toBe(await sha256Base64(SYSTEM_THEME_SCRIPT));
  });

  it("allows blob: images (the wizard's local logo preview, ruling 10)", () => {
    expect(buildCsp("n")).toContain("img-src 'self' data: blob:");
  });

  it("adds the R2 S3 host to connect-src when R2_ACCOUNT_ID is set (the presigned logo PUT)", () => {
    const account = "0123456789abcdef0123456789abcdef";
    expect(r2ConnectSources(account)).toEqual([
      `https://${account}.r2.cloudflarestorage.com`,
    ]);
    expect(buildCsp("n", { connectSrc: r2ConnectSources(account) })).toContain(
      `connect-src 'self' https://*.mux.com https://inferred.litix.io https://${account}.r2.cloudflarestorage.com;`
    );
    for (const unset of [undefined, "", "not an account", "evil.com/x"]) {
      expect(r2ConnectSources(unset)).toEqual([]);
    }
  });
});

describe("security headers on the site", () => {
  it("sends the full set on HTML, with every inline script allowed", async () => {
    // `system` theme (no cookie): the page inlines the pre-paint script.
    const response = await fetchSite("/");
    expect(response.status).toBe(200);
    const { headers } = response;
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("permissions-policy")).toBe(
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    );
    expect(headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(headers.get("reporting-endpoints")).toBe(
      `csp="${ORIGIN}/api/csp-report"`
    );
    // A nonced page is never stored for someone else.
    expect(headers.get("cache-control")).toBe("private, no-cache");
    // dev: enforced, and no HSTS (localhost is plain http).
    expect(headers.get("strict-transport-security")).toBeNull();
    expect(headers.get("content-security-policy-report-only")).toBeNull();
    const csp = headers.get("content-security-policy") ?? "";
    const nonce = csp.match(NONCE_SOURCE)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).toContain(`'sha256-${THEME_SCRIPT_HASH}'`);

    const html = await response.text();
    const scripts = [...html.matchAll(INLINE_SCRIPT)];
    expect(scripts.length).toBeGreaterThan(1);
    const hashes = await Promise.all(
      scripts.map(([, , body]) => sha256Base64(body ?? ""))
    );
    for (const [index, [, attrs = "", body = ""]] of scripts.entries()) {
      if (DATA_BLOCK.test(attrs)) {
        continue; // Data blocks are not run, so CSP does not apply.
      }
      const allowed =
        attrs.match(NONCE_ATTR)?.[1] === nonce ||
        hashes[index] === THEME_SCRIPT_HASH;
      expect(allowed, `inline script not allowed: ${body.slice(0, 80)}`).toBe(
        true
      );
    }
    expect(hashes).toContain(THEME_SCRIPT_HASH);
  });

  it("points Reporting-Endpoints at the request's own origin, never SITE_URL", async () => {
    // SITE_URL is http://localhost:5173 in the tests; another host (a
    // custom domain, a preview URL) must still report to itself.
    const response = await exports.default.fetch(
      "https://other-host.example/?token=secret"
    );
    expect(response.headers.get("reporting-endpoints")).toBe(
      'csp="https://other-host.example/api/csp-report"'
    );
    await response.body?.cancel();
  });

  it("uses a fresh nonce per response", async () => {
    const [a, b] = await Promise.all([fetchSite("/"), fetchSite("/")]);
    const nonceOf = (response: Response | undefined): string | undefined =>
      response?.headers
        .get("content-security-policy")
        ?.match(NONCE_SOURCE)?.[1];
    expect(nonceOf(a)).toBeTruthy();
    expect(nonceOf(a)).not.toBe(nonceOf(b));
    await Promise.all([a?.body?.cancel(), b?.body?.cancel()]);
  });

  it("sends nosniff but no CSP on /api JSON", async () => {
    const response = await fetchSite("/api/health");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("reporting-endpoints")).toBeNull();
    await response.body?.cancel();
  });

  it("puts the headers on the legacy 301s too", async () => {
    const response = await fetchSite("/login?next=%2Faccount", {
      redirect: "manual",
    });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toContain("/sign-in");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'"
    );
  });

  it("keeps /turnstile-bridge's own CSP (a route's policy wins)", async () => {
    const response = await fetchSite("/turnstile-bridge");
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain(`'sha256-${THEME_SCRIPT_HASH}'`);
    expect(csp).not.toContain("default-src 'self'");
    expect(
      response.headers.get("content-security-policy-report-only")
    ).toBeNull();
    // The shared headers are still added.
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    await response.body?.cancel();
  });

  it("sends the HTML 404 page with the full set", async () => {
    const response = await fetchSite("/does-not-exist");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'self'"
    );
    await response.body?.cancel();
  });
});

describe("the dev tools under the headers", () => {
  it("sends /dev/mail with the full set", async () => {
    const response = await fetchSite("/dev/mail");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'"
    );
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    // The route's own `no-store` wins over the default.
    expect(response.headers.get("cache-control")).toBe("no-store");
    await response.body?.cancel();
  });
});

describe("respondSecurely", () => {
  it("answers an escaping exception with a 500 that has the headers", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await respondSecurely("production", () => {
      throw new Error("boom");
    });
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains"
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("Internal Server Error");
    expect(log).toHaveBeenCalledWith(
      "[site] Failed to handle the request:",
      expect.any(Error)
    );
    log.mockRestore();
  });

  it("passes one nonce to the handler and into the CSP", async () => {
    let seen = "";
    const response = await respondSecurely("production", (nonce) => {
      seen = nonce;
      return new Response("<!doctype html>", {
        headers: { "content-type": "text/html" },
      });
    });
    expect(seen).not.toBe("");
    expect(response.headers.get("content-security-policy")).toBe(
      buildCsp(seen)
    );
  });
});

describe("withSecurityHeaders", () => {
  const html = (init?: ResponseInit): Response =>
    new Response("<!doctype html>", {
      ...init,
      headers: { "content-type": "text/html; charset=utf-8", ...init?.headers },
    });

  it.each(["dev", "staging", "production"] as const)(
    "reports in %s: the directives and Reporting-Endpoints on documents",
    (environment) => {
      const requestUrl = "https://smog.example";
      const page = withSecurityHeaders(html(), {
        environment,
        nonce: "n",
        requestUrl,
      });
      const csp =
        page.headers.get("content-security-policy") ??
        page.headers.get("content-security-policy-report-only") ??
        "";
      expect(csp).toContain("report-uri /api/csp-report; report-to csp");
      expect(page.headers.get("reporting-endpoints")).toBe(
        'csp="https://smog.example/api/csp-report"'
      );
      const redirect = withSecurityHeaders(
        Response.redirect("https://smog.example/", 302),
        { environment, nonce: "n", requestUrl }
      );
      expect(redirect.headers.get("reporting-endpoints")).toBe(
        'csp="https://smog.example/api/csp-report"'
      );
      const json = withSecurityHeaders(Response.json({}), {
        environment,
        nonce: "n",
        requestUrl,
      });
      expect(json.headers.get("reporting-endpoints")).toBeNull();
    }
  );

  it("sends no Reporting-Endpoints without a valid request URL, and keeps a route's own", () => {
    expect(
      withSecurityHeaders(html(), {
        environment: "production",
        nonce: "n",
      }).headers.get("reporting-endpoints")
    ).toBeNull();
    const own = withSecurityHeaders(
      html({ headers: { "reporting-endpoints": 'x="https://a.example/r"' } }),
      {
        environment: "production",
        nonce: "n",
        requestUrl: "https://smog.example",
      }
    );
    expect(own.headers.get("reporting-endpoints")).toBe(
      'x="https://a.example/r"'
    );
  });

  it("adds HSTS outside dev and Report-Only in staging", () => {
    const staging = withSecurityHeaders(html(), {
      environment: "staging",
      nonce: "n",
    });
    expect(staging.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains"
    );
    expect(staging.headers.get("content-security-policy")).toBeNull();
    expect(staging.headers.get("content-security-policy-report-only")).toBe(
      buildCsp("n")
    );
  });

  it("enforces the CSP in production", () => {
    const production = withSecurityHeaders(html(), {
      environment: "production",
      nonce: "n",
    });
    expect(production.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains"
    );
    expect(production.headers.get("content-security-policy")).toBe(
      buildCsp("n")
    );
    expect(
      production.headers.get("content-security-policy-report-only")
    ).toBeNull();
  });

  it("keeps a route's own CSP and headers (the route wins)", () => {
    const own = "default-src 'none'; frame-ancestors 'none'";
    const response = withSecurityHeaders(
      html({
        headers: {
          "content-security-policy": own,
          "referrer-policy": "no-referrer",
        },
      }),
      { environment: "staging", nonce: "n" }
    );
    expect(response.headers.get("content-security-policy")).toBe(own);
    expect(
      response.headers.get("content-security-policy-report-only")
    ).toBeNull();
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
  });

  it("works on a response with immutable headers", () => {
    const response = withSecurityHeaders(
      Response.redirect("https://example.com/", 301),
      { environment: "production", nonce: "n" }
    );
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://example.com/");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("the sponsor token pages (review I-8)", () => {
  it.each([
    "/sponsor/edit?token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "/sponsor/renew?token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ])("%s sends no Referer anywhere: the token is in its URL", async (path) => {
    const response = await fetchSite(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    // And for a client navigation, the page's own meta.
    expect(await response.text()).toMatch(REFERRER_META);
  });

  it("the wizard keeps the site's policy", async () => {
    const response = await fetchSite("/sponsor");
    await response.body?.cancel();
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin"
    );
  });
});
