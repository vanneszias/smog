// @vitest-environment node
import {
  getRedirectUrl,
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { LEGACY_REDIRECTS } from "./legacyRedirects";

const SITE = "https://app.smog.vlaanderen";

/**
 * Runs a URL through the real `next.config.ts` — its redirects, then its
 * rewrites, in Next's own order and with Next's own matcher — so a row that
 * is right in the table but shadowed or mistyped in the config still fails.
 */
async function route(path: string) {
  const response = await unstable_getResponseFromNextConfig({
    nextConfig,
    url: `${SITE}${path}`,
  });

  return {
    redirect: getRedirectUrl(response),
    rewrite: getRewrittenUrl(response),
    status: response.status,
  };
}

const TABLE: [source: string, destination: string][] = [
  ["/gestures", "/nl/gestures"],
  ["/favorites", "/nl/favorites"],
  ["/lists", "/nl/account/lists"],
  ["/lists/abc123", "/nl/account/lists"],
  ["/privacy", "/nl/privacy"],
  ["/terms", "/nl"],
  ["/sponsor", "/nl/sponsor"],
  ["/sponsors", "/nl/sponsor"],
  ["/sponsors/re-edit", "/nl/sponsor"],
  ["/sponsors/success", "/nl/sponsor"],
  ["/success", "/nl/sponsor"],
  ["/account", "/nl/account"],
  ["/login", "/nl/sign-in"],
  ["/callback", "/nl"],
];

describe("the previous website's URLs", () => {
  it("has one test row per redirect", () => {
    // `/lists` and `/lists/:token` are two redirect rows and two test rows.
    expect(TABLE).toHaveLength(LEGACY_REDIRECTS.length);
  });

  it.each(TABLE)("redirects %s to %s with a 308", async (source, target) => {
    expect(await route(source)).toEqual({
      redirect: `${SITE}${target}`,
      rewrite: null,
      status: 308,
    });
  });

  it.each(TABLE)("keeps the query string on %s", async (source, target) => {
    const { redirect } = await route(`${source}?q=hand&page=2`);

    expect(redirect).toBe(`${SITE}${target}?q=hand&page=2`);
  });

  it("sends /gestures/<id> to the lookup endpoint, query and all", async () => {
    expect(await route("/gestures/jd7abc123?ref=qr")).toEqual({
      redirect: null,
      rewrite: `${SITE}/api/legacy/gestures/jd7abc123?ref=qr`,
      status: 200,
    });
  });

  it.each([
    "/nl",
    "/nl/gestures",
    "/nl/gestures/12",
    "/en/gestures/12",
    "/fr/favorites",
    "/nl/account/lists",
    "/nl/sign-in",
    "/nl/sponsor",
    "/admin",
    "/admin/collections/gestures",
    "/.well-known/apple-app-site-association",
    "/.well-known/assetlinks.json",
  ])("leaves %s alone", async (path) => {
    expect(await route(path)).toEqual({
      redirect: null,
      rewrite: null,
      status: 200,
    });
  });

  it.each([
    ["/account/password", "/api/account/password"],
    ["/account/lists/create", "/api/account/lists/create"],
    ["/sponsor/start", "/api/sponsor/start"],
    ["/sponsor/re-edit", "/api/sponsor/re-edit"],
  ])("still rewrites the form target %s", async (path, destination) => {
    expect(await route(path)).toEqual({
      redirect: null,
      rewrite: `${SITE}${destination}`,
      status: 200,
    });
  });
});
