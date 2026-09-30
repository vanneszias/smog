import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ORIGIN = "http://localhost:5173";
const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEF";
// The first render of a page transforms the root, the shell and the kit.
const FIRST_RENDER_TIMEOUT = 120_000;
const HREF = /href="([^"]*magic-link\/verify[^"]*)"/;

async function page(query: string): Promise<string> {
  const response = await exports.default.fetch(
    `${ORIGIN}/magic-link/app${query}`,
    { headers: { "accept-language": "en" } }
  );
  expect(response.status).toBe(200);
  return await response.text();
}

describe("/magic-link/app (the app's link, opened in a browser)", () => {
  it(
    "explains the link is for the app and offers a browser sign-in with fixed callbacks",
    async () => {
      const html = await page(`?token=${TOKEN}`);
      expect(html).toContain("This link signs you in to the SMOG &amp; Co app");
      const href = html.match(HREF)?.[1]?.replaceAll("&amp;", "&") ?? "";
      const url = new URL(href, ORIGIN);
      expect(url.origin).toBe(ORIGIN);
      expect(url.pathname).toBe("/api/auth/magic-link/verify");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        callbackURL: "/",
        errorCallbackURL: "/magic-link",
        token: TOKEN,
      });
      expect(html).toContain('name="robots"');
    },
    FIRST_RENDER_TIMEOUT
  );

  it("ignores any other parameter (no redirect target)", async () => {
    const html = await page(
      `?token=${TOKEN}&callbackURL=https%3A%2F%2Fevil.test&redirect=%2F%2Fevil.test`
    );
    // Reflected only as this page's own same-site `redirect` for sign-in.
    expect(html).not.toContain('href="https://evil.test');
    expect(html).not.toContain('href="//evil.test');
  });

  it.each(["", "?token=short", "?token=%3Cscript%3E%22"])(
    "a missing or malformed token (%s) shows the invalid-link message",
    async (query) => {
      const html = await page(query);
      expect(html).toContain("This link has expired or is no longer valid.");
      expect(html).not.toMatch(HREF);
    }
  );
});

describe("?redirect= on the auth pages (the root passes raw params through)", () => {
  it.each([
    ["https%3A%2F%2Fevil.test", "/"],
    ["%2F%2Fevil.test", "/"],
    ["%2F%5Cevil.test", "/"],
    ["%2Faccount", "/account"],
  ])(
    "a good magic link lands on a same-site path only (%s)",
    async (target, landing) => {
      // Follow the redirects by hand (the router may first drop the bad
      // param with its own same-page redirect) and record every hop.
      const hops: string[] = [];
      let url = `${ORIGIN}/magic-link?redirect=${target}`;
      for (let hop = 0; hop < 3; hop += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: each hop follows the previous response.
        const response = await exports.default.fetch(url, {
          redirect: "manual",
        });
        const location = response.headers.get("location");
        if (response.status < 300 || response.status >= 400 || !location) {
          break;
        }
        hops.push(location);
        url = new URL(location, url).toString();
        if (!url.includes("/magic-link")) {
          break;
        }
      }
      for (const location of hops) {
        expect(new URL(location, ORIGIN).origin).toBe(ORIGIN);
        expect(location).not.toContain("evil");
      }
      expect(hops.at(-1)).toBe(landing);
    }
  );

  it("the sign-in page carries no unsafe redirect into its links", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/sign-in?redirect=https%3A%2F%2Fevil.test`
    );
    const links = (await response.text()).match(/href="[^"]*"/g) ?? [];
    expect(links.filter((link) => link.includes("evil.test"))).toEqual([]);
  });
});
