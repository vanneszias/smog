import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { SYSTEM_THEME_SCRIPT } from "../src/lib/preferences";
import {
  buildCsp,
  THEME_SCRIPT_HASH,
  withSecurityHeaders,
} from "../src/worker/headers";

const ORIGIN = "http://localhost:5173";
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
const NONCE_ATTR = /\bnonce="([^"]+)"/;
const NONCE_SOURCE = /'nonce-([^']+)'/;
const DATA_BLOCK = /\btype="application\/(?:ld\+)?json"/;

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
        "img-src 'self' data: blob: https://image.mux.com",
        "media-src 'self' blob: https://stream.mux.com https://*.mux.com",
        "connect-src 'self' https://*.mux.com https://inferred.litix.io",
        "frame-src https://challenges.cloudflare.com",
        "worker-src 'self' blob:",
        "font-src 'self' data: https://fonts.gstatic.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; ")
    );
  });

  it("hashes the exact theme pre-paint script the page inlines", async () => {
    expect(THEME_SCRIPT_HASH).toBe(await sha256Base64(SYSTEM_THEME_SCRIPT));
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

  it("sends the HTML 404 page with the full set", async () => {
    const response = await fetchSite("/does-not-exist");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'self'"
    );
    await response.body?.cancel();
  });
});

describe("withSecurityHeaders", () => {
  const html = (init?: ResponseInit): Response =>
    new Response("<!doctype html>", {
      ...init,
      headers: { "content-type": "text/html; charset=utf-8", ...init?.headers },
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
