import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
} from "@playwright/test";
import { ORIGIN, stubMux, stubMuxStream, waitForApp } from "./helpers";
import { signInAsAdmin } from "./maintenance";

/*
 * Shared admin e2e helpers: the admin pages, a signed-in admin context per
 * theme and width, and the review-screenshot browser (phase 5 task 7).
 * No `expect` here, so a helper never registers anything with a spec.
 */

/** As playwright.config.ts: the preinstalled Chromium, launched by path. */
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";

export const THEMES = ["light", "dark"] as const;
export const WIDTHS = [390, 1280] as const;
export type Theme = (typeof THEMES)[number];

/** Every admin screen, by a short name (the screenshot file prefix). */
export const ADMIN_PAGES = [
  ["dashboard", "/admin"],
  ["sponsorships", "/admin/sponsorships"],
  ["sponsorships-all", "/admin/sponsorships?tab=all"],
  ["audit", "/admin/audit"],
  ["gestures", "/admin/gestures"],
  ["gesture-new", "/admin/gestures/new"],
  ["categories", "/admin/categories"],
  ["users", "/admin/users"],
  ["settings", "/admin/settings"],
  ["emails", "/admin/emails?template=auth/otp"],
] as const;

/** One oRPC call over HTTP, as the admin client makes it. */
export async function adminRpc<T>(
  request: APIRequestContext,
  path: string,
  input: unknown = null
): Promise<T> {
  const response = await request.post(`/api/rpc/${path}`, {
    data: { json: input },
    headers: { origin: ORIGIN },
  });
  const body = (await response.json()) as { json: T };
  if (!response.ok()) {
    throw new Error(
      `[e2e] ${path} answered ${response.status()}: ${JSON.stringify(body)}`
    );
  }
  return body.json;
}

/** The seeded "Hond" gesture's id (the editor screens open it). */
export async function hondId(request: APIRequestContext): Promise<string> {
  const { items } = await adminRpc<{ items: { id: string; name: string }[] }>(
    request,
    "admin/gestures/list",
    { q: "hond" }
  );
  const hond = items.find((item) => item.name === "Hond");
  if (!hond) {
    throw new Error("[e2e] the dev seed has no gesture named Hond");
  }
  return hond.id;
}

/** Mux stills are stubbed and streams answered empty (the suite runs offline). */
export async function stubMuxMedia(page: Page): Promise<void> {
  await stubMux(page);
  await stubMuxStream(page);
}

/** Pages whose consent banner was answered (it does not come back). */
const consented = new WeakSet<Page>();

/**
 * Opens an admin path, waits for hydration and answers the consent banner
 * (it shows just after hydration, once per context).
 */
export async function openAdmin(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForApp(page);
  if (consented.has(page)) {
    return;
  }
  await page
    .getByRole("button", { name: "Alleen noodzakelijke" })
    .click({ timeout: 5000 })
    .then(() => consented.add(page))
    .catch(() => undefined);
}

/**
 * A context in `theme` at `width` (reduced motion, nl-BE, Brussels), with
 * the theme cookie set, so the first paint has the right colours.
 */
export async function themedContext(
  browser: Browser,
  theme: Theme,
  width: number
): Promise<BrowserContext> {
  const context = await browser.newContext({
    colorScheme: theme,
    locale: "nl-BE",
    reducedMotion: "reduce",
    timezoneId: "Europe/Brussels",
    viewport: { height: 900, width },
  });
  await context.addCookies([{ name: "theme", url: ORIGIN, value: theme }]);
  return context;
}

/**
 * The review-screenshot browser: Chromium's own UI (the date inputs) in
 * Belgian Dutch, which needs `--lang` and `LANG` at launch.
 */
export async function launchReviewBrowser(): Promise<Browser> {
  return await chromium.launch({
    args: ["--lang=nl-BE"],
    env: { ...process.env, LANG: "nl_BE.UTF-8", LANGUAGE: "nl_BE" },
    ...(existsSync(PREINSTALLED_CHROMIUM)
      ? { executablePath: PREINSTALLED_CHROMIUM }
      : {}),
  });
}

/** The screenshot directory (`ADMIN_SHOTS_DIR`), created; `undefined` when unset. */
export async function shotsDir(): Promise<string | undefined> {
  const dir = process.env.ADMIN_SHOTS_DIR;
  if (dir) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

/**
 * Runs `shoot` once per theme and width, each in its own signed-in admin
 * context (Mux media stubbed), closing it afterwards.
 */
export async function forEachThemeAndWidth(
  browser: Browser,
  shoot: (page: Page, theme: Theme, width: number) => Promise<void>
): Promise<void> {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      // biome-ignore lint/performance/noAwaitInLoops: one context at a time.
      const context = await themedContext(browser, theme, width);
      try {
        const page = await context.newPage();
        await stubMuxMedia(page);
        await signInAsAdmin(page.request);
        await shoot(page, theme, width);
      } finally {
        await context.close();
      }
    }
  }
}
