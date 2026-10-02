import { MUX_DEFAULT_API_URL } from "@smog/config/env/worker";
import { isAllowedUploadUrl } from "@smog/video";
import { describe, expect, it } from "vitest";
import {
  buildCsp,
  devConnectSources,
  withSecurityHeaders,
} from "../src/worker/headers";

/*
 * The admin video upload is a browser PUT straight to the Mux direct-upload
 * URL (ruling 3/4), so the CSP `connect-src` must allow every URL the
 * server accepts from Mux (`isAllowedUploadUrl`), and the Mux fake's origin
 * in dev only (the e2e).
 */

const WHITESPACE = /\s+/;

function sources(csp: string, directive: string): string[] {
  const entry = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${directive} `));
  return entry ? entry.split(WHITESPACE).slice(1) : [];
}

/** CSP host-source matching, for the `https://host` and `https://*.host` forms used here. */
function allows(list: readonly string[], url: string): boolean {
  const target = new URL(url);
  return list.some((source) => {
    if (source === "'self'") {
      return false;
    }
    const parsed = new URL(source.replace("*.", "wildcard."));
    if (parsed.protocol !== target.protocol || parsed.port !== target.port) {
      return false;
    }
    if (source.includes("://*.")) {
      const suffix = parsed.hostname.slice("wildcard".length);
      return target.hostname.endsWith(suffix);
    }
    return parsed.hostname === target.hostname;
  });
}

const MUX_UPLOAD_URLS = [
  "https://direct-uploads.oci-us-ashburn-1-vop1.production.mux.com/upload/abc?sig=1",
  "https://direct-uploads.production.mux.com/upload/abc",
];

describe("the CSP and the Mux direct upload", () => {
  it("connect-src allows every upload URL the server accepts from Mux", () => {
    const connect = sources(buildCsp("n"), "connect-src");
    for (const url of MUX_UPLOAD_URLS) {
      expect(isAllowedUploadUrl(url, MUX_DEFAULT_API_URL), url).toBe(true);
      expect(allows(connect, url), url).toBe(true);
    }
  });

  it("adds extra connect sources to connect-src only", () => {
    const csp = buildCsp("n", { connectSrc: ["http://localhost:4010"] });
    expect(sources(csp, "connect-src")).toEqual([
      "'self'",
      "https://*.mux.com",
      "https://inferred.litix.io",
      "http://localhost:4010",
    ]);
    expect(sources(csp, "media-src")).not.toContain("http://localhost:4010");
    expect(
      withSecurityHeaders(
        new Response("<!doctype html>", {
          headers: { "content-type": "text/html" },
        }),
        {
          connectSrc: ["http://localhost:4010"],
          environment: "dev",
          nonce: "n",
        }
      ).headers.get("content-security-policy")
    ).toBe(csp);
  });

  it("allows the Mux fake's origin in dev only", () => {
    expect(devConnectSources("dev", "http://localhost:4010/")).toEqual([
      "http://localhost:4010",
    ]);
    expect(devConnectSources("dev", MUX_DEFAULT_API_URL)).toEqual([]);
    expect(devConnectSources("dev", undefined)).toEqual([]);
    expect(devConnectSources("dev", "not a url")).toEqual([]);
    expect(devConnectSources("staging", "http://localhost:4010")).toEqual([]);
    expect(devConnectSources("production", "http://localhost:4010")).toEqual(
      []
    );
  });
});
