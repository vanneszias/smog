import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { type Theme, themedContext } from "./admin";
import {
  blockingViolations,
  ORIGIN,
  signInWithApi,
  stubMux,
  stubMuxStream,
  waitForApp,
} from "./helpers";

/*
 * Shared by the public accessibility specs (phase 9 task 5): the route
 * list every spec walks, a context per theme and width, the consent that
 * is decided up front, and one axe call that labels what it finds. No
 * `test` here, so importing this registers nothing.
 */

/** The localStorage key of `@smog/local-store` (the guest's device store). */
const STORE_KEY = "smog:guest:v1";

/**
 * Decides the consent banner up front (declined), so it covers nothing;
 * the banner states ask for it in their own tests.
 */
export async function decideConsent(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(
        key,
        JSON.stringify({
          consent: { analytics: false, decidedAt: Date.now() },
          favorites: [],
          lists: [],
          preferences: {
            importDismissedFor: [],
            locale: null,
            theme: "system",
          },
          recentSearches: [],
          version: 2,
        })
      );
    }
  }, STORE_KEY);
}

/** A page in `theme` at `width` with its stills stubbed and consent decided. */
export async function newPublicPage(
  browser: Parameters<typeof themedContext>[0],
  theme: Theme,
  width: number,
  { consent = true }: { consent?: boolean } = {}
) {
  const context = await themedContext(browser, theme, width);
  const page = await context.newPage();
  await stubMux(page);
  // An empty valid playlist: the player shows its poster, no error opens.
  await stubMuxStream(page);
  if (consent) {
    await decideConsent(page);
  }
  return { context, page };
}

/** Opens a path and waits for hydration and the page's `h1`. */
export async function openPublic(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForApp(page);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
}

export interface Finding {
  id: string;
  nodes: string[];
  where: string;
}

/** axe's blocking findings, each labelled with where it was found. */
export async function scan(
  page: Page,
  where: string,
  { menuOpen = false }: { menuOpen?: boolean } = {}
): Promise<Finding[]> {
  return (await blockingViolations(page, { menuOpen })).map((violation) => ({
    ...violation,
    where,
  }));
}

/**
 * Rule ids first, per place: a finding that only a newer Chromium shows is
 * recognised by its rule, not by a count.
 */
export function byRule(findings: readonly Finding[]): string[] {
  return findings.map(
    (finding) =>
      `${finding.where}: ${finding.id} [${finding.nodes.join(" | ")}]`
  );
}

/** A guest route (no session), by a short name. */
export interface Route {
  name: string;
  path: string;
}

/**
 * Every public route and state a guest reaches by URL. The sponsor wizard
 * steps, the signed-in states and the overlays are in the specs that need
 * a session or a click first.
 */
export const GUEST_ROUTES: readonly Route[] = [
  { name: "home", path: "/" },
  { name: "gestures", path: "/gestures" },
  { name: "gestures-query", path: "/gestures?q=hond" },
  { name: "gestures-none", path: "/gestures?q=zzzzqxj" },
  { name: "gestures-category", path: "/gestures?category=dieren" },
  { name: "gesture", path: "/gestures/hond" },
  { name: "favorites", path: "/favorites" },
  { name: "lists", path: "/lists" },
  { name: "account", path: "/account" },
  { name: "sign-in", path: "/sign-in" },
  { name: "sign-up", path: "/sign-up" },
  { name: "forgot-password", path: "/forgot-password" },
  { name: "reset-password", path: "/reset-password?token=e2e-token" },
  {
    name: "reset-password-bad-link",
    path: "/reset-password?error=INVALID_TOKEN",
  },
  { name: "verify-email", path: "/verify-email" },
  { name: "verify-email-bad-link", path: "/verify-email?error=invalid_token" },
  { name: "magic-link-bad-link", path: "/magic-link?error=INVALID_TOKEN" },
  { name: "privacy", path: "/privacy" },
  { name: "terms", path: "/terms" },
  { name: "sponsor", path: "/sponsor" },
  { name: "not-found", path: "/dit-bestaat-niet" },
];

/** The page is in the light theme (the cookie); `dark` flips the class. */
async function setDark(page: Page, dark: boolean): Promise<void> {
  await page.evaluate((on) => {
    document.documentElement.classList.toggle("dark", on);
  }, dark);
}

/** How to open a menu again (axe's own run dismisses it). */
export interface Menu {
  open: () => Promise<unknown>;
  visible: () => Promise<unknown>;
}

/**
 * Scans the page as it is (light), then the same DOM in the dark theme.
 * The theme is one class on `<html>` that the server sets (`shell.spec.ts`
 * holds that); flipping it here keeps every state at one page load, so the
 * whole matrix fits the shard's time.
 */
export async function scanThemes(
  page: Page,
  where: string,
  { menu }: { menu?: Menu } = {}
): Promise<Finding[]> {
  const menuOpen = menu !== undefined;
  const found = await scan(page, `${where} [light]`, { menuOpen });
  const light = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor
  );
  await setDark(page, true);
  const dark = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor
  );
  // The flip must have changed the palette, or the dark scan proves nothing.
  expect(dark, `${where}: the dark theme applies`).not.toBe(light);
  if (menu) {
    // axe's run moves the focus, which dismisses a menu: open it again.
    await menu.open();
    await menu.visible();
  }
  found.push(...(await scan(page, `${where} [dark]`, { menuOpen })));
  await setDark(page, false);
  return found;
}

/** One oRPC call over HTTP, as the site's client makes it. */
export async function rpc<T>(
  request: APIRequestContext,
  path: string,
  input: unknown = {}
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

export interface Fixture {
  /** Removes the favorites and the list again. */
  cleanup: () => Promise<void>;
  editPath: string;
  listId: string;
  listName: string;
  viewPath: string;
}

const LIST_NAME = "A11y klas";
const SLUGS = ["hond", "kat", "paard"] as const;

/**
 * A signed-in account with three favorites and a list of the same three
 * gestures, shared by a view and an edit link. The account is a new user
 * (as every spec's); `cleanup` removes the rows it made.
 */
export async function seedAccount(page: Page): Promise<Fixture> {
  await signInWithApi(page);
  const { request } = page;
  const ids: string[] = [];
  for (const slug of SLUGS) {
    // biome-ignore lint/performance/noAwaitInLoops: a few rows, in order.
    const { id } = await rpc<{ id: string }>(request, "gestures/bySlug", {
      slug,
    });
    ids.push(id);
    await rpc(request, "favorites/add", { gestureId: id });
  }
  const list = await rpc<{ id: string }>(request, "lists/create", {
    name: LIST_NAME,
  });
  for (const gestureId of ids) {
    // biome-ignore lint/performance/noAwaitInLoops: the order is the list's.
    await rpc(request, "lists/addItem", { gestureId, id: list.id });
  }
  const view = await rpc<{ token: string }>(request, "lists/share/create", {
    id: list.id,
    role: "view",
  });
  const edit = await rpc<{ token: string }>(request, "lists/share/create", {
    id: list.id,
    role: "edit",
  });
  return {
    cleanup: async () => {
      await rpc(request, "lists/delete", { id: list.id });
      for (const gestureId of ids) {
        // biome-ignore lint/performance/noAwaitInLoops: a few rows.
        await rpc(request, "favorites/remove", { gestureId });
      }
    },
    editPath: `/lists/${edit.token}`,
    listId: list.id,
    listName: LIST_NAME,
    viewPath: `/lists/${view.token}`,
  };
}

const OVERLAYS = '[role="dialog"], [role="alertdialog"], [role="menu"]';

/** Escape closes the overlay. */
export async function closeWithEscape(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      page.locator(OVERLAYS).evaluateAll((nodes) =>
        nodes
          // The Mux player's own elements (excluded from axe as well).
          .filter((node) => !node.tagName.toLowerCase().startsWith("media-"))
          .map(
            (node) =>
              `${node.tagName.toLowerCase()}[${node.getAttribute("role")}] ${(node.textContent ?? "").trim().slice(0, 40)}`
          )
      )
    )
    .toEqual([]);
}
