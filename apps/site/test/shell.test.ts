import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { signedUp } from "./helpers";

const ORIGIN = "http://localhost:5173";
// The first page render transforms the root, the shell and the kit.
const FIRST_RENDER_TIMEOUT = 120_000;
const HTML_TAG = /<html[^>]*>/;
const DARK_CLASS = /class="[^"]*\bdark\b/;
const THEME_COLOR_META = /<meta[^>]*name="theme-color"[^>]*>/g;

async function page(
  path: string,
  headers: Record<string, string> = {}
): Promise<string> {
  const response = await exports.default.fetch(`${ORIGIN}${path}`, {
    headers,
  });
  expect(response.status).toBe(200);
  return await response.text();
}

function htmlTag(html: string): string {
  return html.match(HTML_TAG)?.[0] ?? "";
}

describe("app shell (SSR)", () => {
  it(
    "renders nl and the system theme by default, with the pre-paint script",
    async () => {
      const html = await page("/");
      const tag = htmlTag(html);
      expect(tag).toContain('lang="nl"');
      expect(tag).not.toContain("dark");
      // `system` follows prefers-color-scheme before the first paint.
      expect(html).toContain("prefers-color-scheme: dark");
      expect(html).toContain("Hoofdnavigatie");
      expect(html).toContain("Gemaakt met ♡ door zias.be");
    },
    FIRST_RENDER_TIMEOUT
  );

  it("sets the dark class from the theme cookie, without the script", async () => {
    const html = await page("/", { cookie: "theme=dark" });
    expect(htmlTag(html)).toMatch(DARK_CLASS);
    expect(html).not.toContain("prefers-color-scheme: dark");
  });

  it("keeps light when the cookie says light", async () => {
    const html = await page("/", { cookie: "theme=light" });
    expect(htmlTag(html)).not.toContain("dark");
    expect(html).not.toContain("prefers-color-scheme: dark");
  });

  it("takes the locale from the cookie, then Accept-Language", async () => {
    const fromCookie = await page("/", {
      "accept-language": "fr-BE,fr;q=0.9",
      cookie: "locale=en",
    });
    expect(htmlTag(fromCookie)).toContain('lang="en"');
    expect(fromCookie).toContain("Main navigation");

    const fromHeader = await page("/", { "accept-language": "fr-BE,fr;q=0.9" });
    expect(htmlTag(fromHeader)).toContain('lang="fr"');
  });

  it("signed in without a locale cookie, takes the account's language", async () => {
    const { cookie } = await signedUp({ locale: "fr" });

    const account = await page("/", { "accept-language": "en", cookie });
    expect(htmlTag(account)).toContain('lang="fr"');

    // The cookie is this browser's choice, and it wins.
    const chosen = await page("/", {
      "accept-language": "en",
      cookie: `${cookie}; locale=nl`,
    });
    expect(htmlTag(chosen)).toContain('lang="nl"');
  });

  it("offers theme-color (light and dark) and a noscript note", async () => {
    const html = await page("/");
    const themeColors = html.match(THEME_COLOR_META) ?? [];
    expect(themeColors).toHaveLength(2);
    expect(themeColors.join(" ")).toContain("(prefers-color-scheme: light)");
    expect(themeColors.join(" ")).toContain("(prefers-color-scheme: dark)");
    expect(html).toContain("<noscript>");
    expect(html).toContain("Zet JavaScript aan");

    // A chosen theme has its own colour only.
    const dark = await page("/", { cookie: "theme=dark" });
    expect(dark.match(THEME_COLOR_META)).toEqual([
      expect.stringContaining('content="#0F1210"'),
    ]);
  });

  it("server-renders the sign-in screen at the email step", async () => {
    const html = await page("/sign-in");
    expect(html).toContain("Aanmelden of registreren");
    expect(html).toContain("E-mailadres");
    // No Turnstile site key in dev: no widget.
    expect(html).not.toContain("challenges.cloudflare.com");
  });

  it("answers an unknown page with the not-found screen", async () => {
    const response = await exports.default.fetch(`${ORIGIN}/nope`);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Pagina niet gevonden");
  });
});
