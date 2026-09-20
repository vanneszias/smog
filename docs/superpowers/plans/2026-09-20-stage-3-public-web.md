# Stage 3: Public Web — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public site — gesture browsing, search, detail pages, favorites and lists — rebuilt on Payload and the Stage 2 component library, replacing `apps/web`'s client-side-everything approach with server-rendered pages that query the database.

**Architecture:** Next.js App Router pages under `apps/site/src/app/(frontend)/[locale]/`, rendering React Server Components that call Payload's Local API directly — no HTTP round trip, no client data layer. Filtering, sorting and pagination move into `where` clauses so a page fetches the rows it shows instead of the whole table. Guest favorites and lists live in the browser; the sync path waits for Stage 4.

**Tech Stack:** Next.js 16 App Router, Payload 3.89.0 Local API, `@smog/ui-web`, `@smog/styles`, Playwright.

**Spec:** [`../specs/2026-09-19-payload-migration-design.md`](../specs/2026-09-19-payload-migration-design.md)

## Global Constraints

Inherits all Stage 0 and Stage 1 global constraints. Additionally:

- **Payload is pinned at `3.89.0`.** 3.90.x raises PBKDF2 to 600,000 iterations and workerd caps at 100,000, so it does not run here at all. Nothing may drag it forward, including transitively.
- **Never combine `required: true` with `localized: true`** — Payload validates required localized fields per locale, so an editor working in `fr` cannot save.
- **Locales are `nl` (default), `en`, `fr`.** Localized fields are `gestures.name`, `gestures.info`, `gestures.concepts`, `categories.name`. Everything else is global.
- **Access filters must never return `{ equals: undefined }`** — the query layer matches that against every row whose column is NULL.
- **Server Components by default.** `"use client"` goes on the smallest component that needs it, never on a page or layout, never on a barrel.
- **Stay on declared `--spacing-*` steps.** `packages/ui-web/src/styles/spacingScale.ts` exports the scanner; `apps/site` already uses it. Off-scale steps resolve to Tailwind's `0.25rem` default rather than failing, so they are silently wrong.
- **The Worker budget is 10 MiB gzipped; CI warns at 8 MiB.** The bundle is at 7,178 KiB (70.1%) entering this stage. Measure at the end of every task that adds a dependency.
- **`bun release:check` is the gate**, not `bun build` — it additionally runs knip (which fails on exported symbols nothing imports), `bun audit --production` and `expo-doctor`.

## Review Focus

Five failure modes the spec implies that no page's happy-path test would catch:

1. **A French visitor sees an empty site.** Payload's `fallback: true` applies to *reads*, not to `where` clauses. Querying the search index or filtering by name in `fr` returns zero rows for Dutch-only content — which is all content, since `en` and `fr` start empty. Task 4 tests that a query in a non-default locale still finds Dutch-only gestures.
2. **Pagination that lies.** Moving filtering server-side means `totalDocs` comes from the database, not from a filtered array. An off-by-one in the page/limit arithmetic, or a count computed before the filter is applied, shows the wrong page count and strands rows nobody can reach. Task 3 tests the last page and a filter that changes the count.
3. **Guest state that silently evaporates.** Favorites and lists live in `localStorage` until Stage 4. Private browsing, a cleared store, a quota error and a corrupt JSON blob must all degrade to "no favorites" rather than throwing on render. Task 6 tests each.
4. **A share link that outlives its revocation.** Un-sharing a list must actually revoke access. `visibility` is currently never consulted, so today only clearing the token works. Task 7 tests that a revoked link stops working.
5. **Deleting a gesture that something points at.** `lists.items.gesture` still has `NOT NULL` with `ON DELETE set null`, so deleting a referenced gesture fails with a raw SQL error. Task 8 tests the delete against a real database and asserts the list survives without the row.

---

## Inherited blockers

Stage 2 handed three things forward. Task 1 clears them because every later task depends on at least one:

- `bun -F site test:e2e` is broken — `--import=tsx/esm` fights Playwright's loader on Node 22 (`ERR_INVALID_RETURN_PROPERTY_VALUE`). Every page in this stage wants browser verification, so this is a prerequisite, not a cleanup.
- Two copies of `@radix-ui/react-dismissable-layer` (tooltip pins 1.1.11, dialog 1.1.19) maintain independent layer stacks, so an open tooltip prevents a dialog closing on Escape. This stage builds overlay-heavy pages.
- The light theme has no visible surface hierarchy: `background` and `surface-raised` are both `#ffffff`, and only a 1.32:1 border separates a card from the page.

---

### Task 1: Clear the inherited blockers

**Files:**
- Modify: `apps/site/package.json` (the `test:e2e` script)
- Modify: `package.json` (root — `overrides`)
- Modify: `packages/styles/src/tokens.ts`
- Modify: `packages/styles/src/tokens.test.ts`
- Modify: `packages/styles/src/contrast.test.ts`
- Create: `apps/site/tests/e2e/overlay-layers.spec.ts`

**Interfaces:**
- Consumes: the token structure from Stage 2 Task 1.
- Produces: a working `bun -F site test:e2e`; a single resolved `@radix-ui/react-dismissable-layer`; `semantic.surface` / `semantic.surfaceRaised` values that are distinguishable from `background` in both themes.

- [ ] **Step 1: Reproduce the e2e script failure**

Run: `bun -F site test:e2e`
Expected: FAIL with `ERR_INVALID_RETURN_PROPERTY_VALUE`. Capture the output — you are about to change the script and need to know you fixed the thing that was broken.

- [ ] **Step 2: Fix the script**

Playwright loads TypeScript itself; the `--import=tsx/esm` is redundant and conflicts. Remove it from the `test:e2e` script in `apps/site/package.json`, leaving `playwright test`.

If Playwright's own loader turns out not to handle the specs (it should — `playwright.config.ts` is already TypeScript), do **not** reinstate `tsx/esm`. Report what failed instead; a second loader is the cause, not the cure.

- [ ] **Step 3: Verify the suite runs**

Run: `bun -F site test:e2e`
Expected: the existing specs execute. On this sandbox `@playwright/test` wants chromium-1243 and only chromium-1194 is installed with no `playwright install` available — if that blocks you, set `launchOptions.executablePath` to `/opt/pw-browsers/chromium` in a throwaway config, run the specs, and **delete the throwaway afterwards**. The committed `playwright.config.ts` must not carry a sandbox-specific path.

- [ ] **Step 4: Prove the duplicate layer bug exists**

Create `apps/site/tests/e2e/overlay-layers.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("Escape closes a dialog even while a tooltip is open", async ({ page }) => {
  await page.goto("/kitchen-sink");

  // Open a tooltip, then a dialog, then press Escape. With two copies of
  // react-dismissable-layer installed, the tooltip's layer stack handles
  // Escape first, calls preventDefault, and the dialog never sees it.
  await page.getByTestId("layer-probe-tooltip-trigger").hover();
  await expect(page.getByRole("tooltip")).toBeVisible();

  await page.getByTestId("layer-probe-dialog-trigger").click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});
```

Add the two probe triggers to the kitchen sink's overlay section, adjacent, with those test ids.

- [ ] **Step 5: Run it to confirm it fails**

Run: `bun -F site test:e2e overlay-layers`
Expected: FAIL — the dialog stays visible after Escape.

If it *passes*, the duplicate is no longer reachable from this combination. Do not delete the test; report that it passes and investigate whether the duplicate is still installed (`bun pm ls | grep dismissable-layer`) before concluding anything.

- [ ] **Step 6: Dedupe the dependency**

Add to the root `package.json` `overrides`:

```json
"@radix-ui/react-dismissable-layer": "1.1.19"
```

Stage 2 found that a plain `overrides` entry did **not** dedupe under bun — the nested exact pins survived. So: add the override, then delete `node_modules` and `bun.lock`'s affected entries by running a full `bun install` (not `--frozen-lockfile`), and verify with `bun pm ls | grep dismissable-layer` that exactly one version resolves.

If one version still does not resolve, stop and report. Do not hand-edit `bun.lock`.

- [ ] **Step 7: Verify the fix and revalidate the other apps**

Run: `bun -F site test:e2e overlay-layers` → PASS.

Then, because this changed a shared dependency: `bun run test`, `bun run check-types`, `bun run build`. All must be green. Report the lockfile diff shape.

- [ ] **Step 8: Write the failing test for the surface hierarchy**

Add to `packages/styles/src/contrast.test.ts`:

```ts
describe("surface hierarchy", () => {
  // A card must be distinguishable from the page behind it without relying
  // on its border. 1.06:1 is not a boundary anyone can see; WCAG's 3:1 is
  // for meaningful boundaries and is too strong for a fill, so this asserts
  // a modest but real step. Measured in a browser during Stage 2: light
  // `background` and `surfaceRaised` were literally the same #ffffff.
  const MIN_SURFACE_STEP = 1.12;

  for (const theme of ["light", "dark"] as const) {
    it(`separates surface from background in the ${theme} theme`, () => {
      expect(
        contrastRatio(tokens.semantic[theme].surface, tokens.semantic[theme].background)
      ).toBeGreaterThanOrEqual(MIN_SURFACE_STEP);
    });

    it(`separates surfaceRaised from background in the ${theme} theme`, () => {
      expect(
        contrastRatio(tokens.semantic[theme].surfaceRaised, tokens.semantic[theme].background)
      ).toBeGreaterThanOrEqual(MIN_SURFACE_STEP);
    });
  }
});
```

- [ ] **Step 9: Run it to confirm it fails**

Run: `bun -F @smog/styles test contrast`
Expected: FAIL on both light-theme cases — `surface` at 1.06 and `surfaceRaised` at 1.00.

- [ ] **Step 10: Adjust the light-theme surfaces**

In `packages/styles/src/tokens.ts`, move the light theme's `background` down the neutral ramp so the surfaces sit above it, rather than pushing the surfaces grey — a white card on a faintly tinted page is the conventional and better-looking direction:

- light `background` → `neutral[100]`
- light `surface` → `WHITE`
- light `surfaceRaised` → `WHITE`

Keep `surface` and `surfaceRaised` equal in light mode; the step that matters is card-versus-page, and elevation is carried by shadow. Dark mode already passes; leave it alone.

Re-check every existing contrast pair afterwards — `foreground on background` and `border on background` both move. If any drops below its threshold, adjust the *foreground* or the border step, never a brand hex.

- [ ] **Step 11: Run the full styles suite**

Run: `bun -F @smog/styles test`
Expected: PASS, including every pre-existing pair.

- [ ] **Step 12: Regenerate the theme and verify in a browser**

Run: `bun -F @smog/ui-web generate:theme && bun check`, then load `/kitchen-sink` and confirm cards read as distinct from the page in light mode.

- [ ] **Step 13: Commit**

```bash
git add apps/site/package.json package.json bun.lock packages/styles apps/site/tests/e2e packages/ui-web
git commit -m "fix: clear the three blockers Stage 2 handed forward"
```

---

### Task 2: Locale routing and the public layout shell

**Files:**
- Create: `apps/site/src/app/(frontend)/[locale]/layout.tsx`
- Create: `apps/site/src/lib/locale.ts`
- Create: `apps/site/src/lib/locale.test.ts`
- Create: `apps/site/src/components/LocaleSwitcher.tsx`
- Create: `apps/site/src/components/LocaleSwitcher.test.tsx`
- Modify: `apps/site/src/app/(frontend)/page.tsx` (redirect `/` to the default locale)

**Interfaces:**
- Consumes: `@smog/ui-web`.
- Produces: `LOCALES` (a readonly tuple `["nl", "en", "fr"]`), `DEFAULT_LOCALE` (`"nl"`), `type Locale`, `isLocale(value: string): value is Locale`, `resolveLocale(segment: string | undefined): Locale`, and `localeHref(pathname: string, next: Locale): string`.

Every locale is path-prefixed, including the default: `/nl/gestures`, `/en/gestures`. Prefixing the default costs one redirect from `/` and buys an unambiguous URL for every page, which matters for SEO and for share links that must not change meaning based on a cookie.

- [ ] **Step 1: Write the failing test**

Create `apps/site/src/lib/locale.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, LOCALES, resolveLocale } from "./locale";

describe("locale", () => {
  it("publishes exactly the three locales the Payload config declares", () => {
    expect(LOCALES).toEqual(["nl", "en", "fr"]);
  });

  it("defaults to Dutch, which is the locale the content is authored in", () => {
    expect(DEFAULT_LOCALE).toBe("nl");
  });

  it("accepts a known locale", () => {
    expect(isLocale("fr")).toBe(true);
  });

  it("rejects an unknown one rather than coercing it", () => {
    expect(isLocale("de")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale("NL")).toBe(false);
  });

  it("resolves an unknown segment to the default instead of throwing", () => {
    // A bad locale in the URL is a 404 concern for the route, not a crash
    // for every helper that reads it.
    expect(resolveLocale("de")).toBe("nl");
    expect(resolveLocale(undefined)).toBe("nl");
  });

  it("resolves a known segment to itself", () => {
    expect(resolveLocale("fr")).toBe("fr");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun -F site test locale`
Expected: FAIL — `Failed to resolve import "./locale"`.

- [ ] **Step 3: Implement**

Create `apps/site/src/lib/locale.ts`:

```ts
/**
 * The locales the public site serves, mirroring `localization.locales` in
 * `payload.config.ts`. Dutch is the default because it is the locale all
 * existing content is authored in; `en` and `fr` start empty and fall back.
 *
 * Every public URL is locale-prefixed, including the default. Prefixing `nl`
 * costs one redirect from `/` and buys a URL whose meaning does not depend on
 * a cookie — which matters for share links, which are pasted between people
 * whose browsers disagree.
 */
export const LOCALES = ["nl", "en", "fr"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "nl";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Narrows a URL segment to a `Locale`, falling back to the default rather
 * than throwing. The route itself is responsible for 404ing an unknown
 * locale; this exists so every helper downstream can assume a valid value.
 */
export function resolveLocale(segment: string | undefined): Locale {
  return segment !== undefined && isLocale(segment) ? segment : DEFAULT_LOCALE;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun -F site test locale`
Expected: PASS, 6 tests.

- [ ] **Step 5: Create the locale layout**

Create `apps/site/src/app/(frontend)/[locale]/layout.tsx`. It must:

- `generateStaticParams` over `LOCALES`.
- `notFound()` when the segment is not a known locale — an unknown locale is a 404, not a silent fallback, or `/de/gestures` would serve Dutch content under a URL that claims otherwise.
- Set `<html lang={locale}>`.
- Render the shared header (site name, nav, `LocaleSwitcher`) and a `<main>`.

- [ ] **Step 6: Redirect the bare root**

Modify `apps/site/src/app/(frontend)/page.tsx` to `redirect(`/${DEFAULT_LOCALE}`)`.

- [ ] **Step 7: Write the LocaleSwitcher test, then implement it**

The switcher must preserve the current path and query string when changing locale — a visitor two pages into a filtered list who switches language should stay where they are. Test that `/en/gestures?q=hallo` becomes `/fr/gestures?q=hallo`, not `/fr`.

```tsx
it("keeps the path and query when switching locale", () => {
  expect(localeHref("/en/gestures?q=hallo", "fr")).toBe("/fr/gestures?q=hallo");
});

it("handles the bare locale root", () => {
  expect(localeHref("/en", "nl")).toBe("/nl");
});
```

Put `localeHref(pathname: string, next: Locale): string` in `locale.ts` so it is testable without rendering.

- [ ] **Step 8: Run the tests, then commit**

```bash
git add apps/site/src/lib apps/site/src/app apps/site/src/components
git commit -m "feat(site): add locale routing and the public layout shell"
```

---

### Task 3: The gestures list page

**Files:**
- Create: `apps/site/src/app/(frontend)/[locale]/gestures/page.tsx`
- Create: `apps/site/src/lib/gestureQuery.ts`
- Create: `apps/site/src/lib/gestureQuery.test.ts`
- Create: `apps/site/src/lib/gestureQuery.int.test.ts`
- Create: `apps/site/tests/e2e/gestures.spec.ts`

**Interfaces:**
- Consumes: `resolveLocale` from Task 2; `GestureGrid`, `CategoryFilter`, `Pagination` from `@smog/ui-web`; the `gestures` and `categories` collections.
- Produces: `buildGestureWhere(params: GestureListParams): Where` and `fetchGestures(params: GestureListParams & { locale: Locale }): Promise<GestureListResult>`, where `GestureListParams = { q?: string; categories?: string[]; page?: number }` and `GestureListResult = { gestures: Gesture[]; totalPages: number; totalDocs: number; page: number }`.

**This replaces client-side filtering.** `apps/web` loads every gesture and filters in the browser. Here the page fetches only the rows it shows. That is the point of the task; do not reintroduce an "load all then filter" path.

- [ ] **Step 1: Write the failing unit test for the where-clause builder**

Create `apps/site/src/lib/gestureQuery.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGestureWhere } from "./gestureQuery";

describe("buildGestureWhere", () => {
  it("always constrains to active gestures, so an inactive one cannot leak", () => {
    expect(buildGestureWhere({})).toEqual({ isActive: { equals: true } });
  });

  it("adds a category constraint when categories are given", () => {
    expect(buildGestureWhere({ categories: ["3", "7"] })).toEqual({
      and: [{ isActive: { equals: true } }, { categories: { in: ["3", "7"] } }],
    });
  });

  it("ignores an empty category list rather than emitting an empty `in`", () => {
    // `{ in: [] }` matches nothing, which would silently empty the page.
    expect(buildGestureWhere({ categories: [] })).toEqual({
      isActive: { equals: true },
    });
  });

  it("ignores a whitespace-only query", () => {
    expect(buildGestureWhere({ q: "   " })).toEqual({ isActive: { equals: true } });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun -F site test gestureQuery`
Expected: FAIL — `Failed to resolve import "./gestureQuery"`.

- [ ] **Step 3: Implement the builder**

Create `apps/site/src/lib/gestureQuery.ts`. The `isActive` constraint is unconditional and non-negotiable: `publicReadActive` already filters at the access layer, but a page that also asks for it stays correct if someone later loosens access, and costs nothing.

- [ ] **Step 4: Run it to verify it passes**

Run: `bun -F site test gestureQuery`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing integration test for pagination**

Review Focus item 2. Create `apps/site/src/lib/gestureQuery.int.test.ts` against a real database. Seed 25 active gestures and 3 inactive ones, page size 12, then assert:

```ts
it("reports a page count derived from the filtered total, not the table size", async () => {
  const result = await fetchGestures({ page: 1, locale: "nl" });
  // 25 active, 3 inactive, 12 per page -> 3 pages. If the count were taken
  // before the isActive filter it would be 28 -> still 3; so also assert the
  // total itself, which is what actually distinguishes the two.
  expect(result.totalDocs).toBe(25);
  expect(result.totalPages).toBe(3);
});

it("serves the last page rather than an empty one", async () => {
  const result = await fetchGestures({ page: 3, locale: "nl" });
  expect(result.gestures).toHaveLength(1);
});

it("clamps a page beyond the end instead of returning an error", async () => {
  const result = await fetchGestures({ page: 99, locale: "nl" });
  expect(result.page).toBe(3);
  expect(result.gestures).toHaveLength(1);
});

it("recomputes the page count when a filter narrows the set", async () => {
  const result = await fetchGestures({ categories: [smallCategoryId], locale: "nl" });
  expect(result.totalPages).toBe(1);
});
```

Fixtures on `unique` columns need a `crypto.randomUUID()` suffix — the local D1 directory is never cleared between runs, and a collision fails in `beforeAll`, which Vitest reports as *skipped*.

- [ ] **Step 6: Run it to verify it fails, then implement `fetchGestures`**

Use `payload.find({ collection: "gestures", where, locale, page, limit: 12, depth: 1 })`. Clamp `page` into `[1, totalPages]` after the first query rather than trusting the input.

- [ ] **Step 7: Build the page**

`page.tsx` is a Server Component. It reads `searchParams` for `q`, `category` and `page`, calls `fetchGestures`, and renders `GestureGrid` with `renderGestureLink` pointing at the detail route. Filters and the search box are client components that push to the URL; the page re-renders on the server.

- [ ] **Step 8: Write the e2e test**

Create `apps/site/tests/e2e/gestures.spec.ts`: load `/nl/gestures`, assert a grid renders; apply a category filter and assert the URL carries it and the result count drops; navigate to page 2 and assert different gestures appear.

- [ ] **Step 9: Run everything, measure the bundle, commit**

```bash
bun -F site test && bun -F site test:e2e gestures && bun -F site check-bundle-size
git add apps/site
git commit -m "feat(site): add the gestures list page with server-side filtering"
```

---

### Task 4: Search

**Files:**
- Create: `apps/site/src/lib/search.ts`
- Create: `apps/site/src/lib/search.test.ts`
- Create: `apps/site/src/lib/search.int.test.ts`
- Modify: `apps/site/src/app/(frontend)/[locale]/gestures/page.tsx`

**Interfaces:**
- Consumes: the `search` collection from Stage 1 Task 7; `buildGestureWhere` from Task 3.
- Produces: `searchGestureIds(query: string, locale: Locale): Promise<(number | string)[]>`.

- [ ] **Step 1: Write the failing integration test — Review Focus item 1**

This is the one that matters. Create `apps/site/src/lib/search.int.test.ts`:

```ts
it("finds a Dutch-only gesture when searching in French", async () => {
  // `fallback: true` applies to reads, not to `where` clauses. A naive
  // `payload.find({ collection: "search", locale: "fr", where: { title: ... } })`
  // returns zero rows for content that only exists in `nl` — which is all
  // content today, since `en` and `fr` start empty. A French visitor would
  // see an empty site and no error.
  const ids = await searchGestureIds("Hallo", "fr");
  expect(ids).toContain(dutchOnlyGestureId);
});

it("prefers a translated match in the requested locale", async () => {
  // Once a French translation exists, searching its French name must find it.
  const ids = await searchGestureIds("Bonjour", "fr");
  expect(ids).toContain(translatedGestureId);
});

it("still finds the Dutch name for a translated gesture", async () => {
  // Falling back must not stop working once a translation exists.
  const ids = await searchGestureIds("Hallo", "fr");
  expect(ids).toContain(translatedGestureId);
});

it("returns nothing for a query that matches nothing, rather than everything", async () => {
  expect(await searchGestureIds("zzzzzzz", "nl")).toEqual([]);
});

it("treats a blank query as no search rather than matching all rows", async () => {
  expect(await searchGestureIds("   ", "nl")).toEqual([]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Expected: FAIL — the import does not resolve, and once it does, the French case returns `[]`.

- [ ] **Step 3: Implement with an explicit fallback**

Query the requested locale, then the default locale, and union the ids preserving requested-locale order. Do **not** try to make one `where` clause span locales — Payload's locale handling is per-query, and a clause that reaches across them is fiction.

```ts
export async function searchGestureIds(
  query: string,
  locale: Locale
): Promise<(number | string)[]> {
  const trimmed = query.trim();
  if (trimmed === "") {
    return [];
  }
  // ... find in `locale`, then in DEFAULT_LOCALE when different, union by id
}
```

- [ ] **Step 4: Run it to verify it passes, then wire it into the page**

The list page composes: when `q` is present, `searchGestureIds` produces an id list which becomes an `id: { in: [...] }` constraint alongside the category filter.

- [ ] **Step 5: Mutation-prove the fallback**

Remove the default-locale second query and confirm `finds a Dutch-only gesture when searching in French` fails by name. A test that passes without the fallback is testing nothing.

- [ ] **Step 6: Commit**

```bash
git add apps/site
git commit -m "feat(site): add search with an explicit cross-locale fallback"
```

---

### Task 5: The gesture detail page

**Files:**
- Create: `apps/site/src/app/(frontend)/[locale]/gestures/[id]/page.tsx`
- Create: `apps/site/tests/e2e/gesture-detail.spec.ts`

**Interfaces:**
- Consumes: `VideoPlayer`, `Badge`, `Card` from `@smog/ui-web`; `resolveLocale`.
- Produces: the detail route; `generateMetadata` for it.

- [ ] **Step 1: Render the gesture**

Server Component. `payload.findByID({ collection: "gestures", id, locale, depth: 1 })`, wrapped so a missing or inactive gesture calls `notFound()` rather than throwing. An inactive gesture must 404 for anonymous visitors — `publicReadActive` already enforces it, but assert it, because a detail page is the obvious place to accidentally use `overrideAccess`.

- [ ] **Step 2: Write the access test**

```ts
it("404s an inactive gesture for an anonymous visitor", async () => { /* ... */ });
it("shows an inactive gesture to an admin", async () => { /* ... */ });
```

The second matters: without it, the first would pass against a page that 404s everything.

- [ ] **Step 3: Metadata**

`generateMetadata` returns the localized name as the title and the localized `info` as the description, with `alternates.languages` covering all three locales. Fall back to the Dutch name when the requested locale is untranslated — an empty `<title>` is worse than a Dutch one.

- [ ] **Step 4: Video**

Render `VideoPlayer` with the gesture's `playbackId`. Stage 2 verified the element upgrades and lays out in a browser but could not verify playback (the sandbox blocks `stream.mux.com`). Assert the player receives the playback id; do not assert it plays.

- [ ] **Step 5: The sponsor overlay — a narrow read path, not a widened one**

The spec defers this from Stage 1: the public gesture page needs `overlayText`,
`sponsoredVideoPlaybackId`, `hasLogo` and `overlayImage` for whichever
sponsorship is active and in term, but `sponsorships.read` is `isAdmin` and
must stay that way — a row carries the sponsor's contact details, email and
VAT number.

**Do not loosen `read`.** Add a server-side projection instead: a helper that
runs `overrideAccess: true` on the server, selects only those four fields, and
returns `null` when no sponsorship is active. The privileged query never
crosses the network; only the projection does.

```ts
export interface GestureOverlay {
  overlayText: string;
  sponsoredVideoPlaybackId: string | null;
  hasLogo: boolean;
  overlayImage: { url: string; alt: string } | null;
}

export async function fetchGestureOverlay(
  gestureId: number | string
): Promise<GestureOverlay | null>;
```

"Active and in term" means `status === "active"` **and** `startDate <= now`
**and** `endDate >= now`. Status alone is not enough — Stage 1 shipped no
status-transition enforcement and no expiry job, so an `active` row with a past
`endDate` exists and would otherwise render a sponsorship nobody is paying for.

Test all of it, and test the negatives hardest:

```ts
it("returns null when the only sponsorship has expired", async () => { /* endDate in the past, status still "active" */ });
it("returns null when the sponsorship has not started yet", async () => { /* startDate in the future */ });
it("returns null when the sponsorship is pending payment", async () => { /* ... */ });
it("never returns the sponsor's contact details", async () => {
  const overlay = await fetchGestureOverlay(id);
  expect(Object.keys(overlay ?? {})).toEqual([
    "overlayText", "sponsoredVideoPlaybackId", "hasLogo", "overlayImage",
  ]);
});
it("does not let an anonymous REST read reach the sponsorship itself", async () => { /* still Forbidden */ });
```

Mutate: return the whole document instead of the projection, and confirm
`never returns the sponsor's contact details` fails by name. Mutate the term
check to status-only and confirm the expiry test fails.

- [ ] **Step 6: e2e, then commit**

```bash
git add apps/site
git commit -m "feat(site): add the gesture detail page"
```

---

### Task 6: Favorites (guest, local)

**Files:**
- Create: `apps/site/src/lib/guestStore.ts`
- Create: `apps/site/src/lib/guestStore.test.ts`
- Create: `apps/site/src/components/FavoriteButton.tsx`
- Create: `apps/site/src/components/FavoriteButton.test.tsx`
- Create: `apps/site/src/app/(frontend)/[locale]/favorites/page.tsx`

**Interfaces:**
- Consumes: `Button` from `@smog/ui-web`.
- Produces: `readGuestFavorites(): string[]`, `toggleGuestFavorite(id: string): string[]`, `GUEST_FAVORITES_KEY`.

**Favorites are local until Stage 4.** The `users.favorites` relationship exists from Stage 1 Task 4, but nothing can write it without auth. The product decision (2026-09-19) is that guests keep state locally and are prompted to sign in when they want it synced. Do not build a guest identity.

- [ ] **Step 1: Write the failing test — Review Focus item 3**

```ts
describe("guest favorites", () => {
  it("returns an empty list when nothing is stored", () => { /* ... */ });

  it("returns an empty list when localStorage throws", () => {
    // Private browsing and blocked site data both throw on access rather
    // than returning null. A render that throws here takes the page down.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(readGuestFavorites()).toEqual([]);
  });

  it("returns an empty list when the stored value is not JSON", () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, "{not json");
    expect(readGuestFavorites()).toEqual([]);
  });

  it("returns an empty list when the stored value is JSON but not an array", () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '{"a":1}');
    expect(readGuestFavorites()).toEqual([]);
  });

  it("drops non-string entries rather than rendering them", () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '["a", 3, null, "b"]');
    expect(readGuestFavorites()).toEqual(["a", "b"]);
  });

  it("does not throw when writing exceeds quota", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => toggleGuestFavorite("a")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails, implement, run to verify it passes**

Every read and write is wrapped in try/catch and every failure degrades to "no favorites". Log with the `[guestStore]` prefix per `AGENTS.md`.

- [ ] **Step 3: The button and the page**

`FavoriteButton` is a client component. The favorites page is a Server Component shell with a client island that reads local state and fetches the corresponding gestures — it cannot server-render, because the server does not know what the guest favourited. Render a skeleton on first paint rather than a flash of "no favorites".

- [ ] **Step 4: Commit**

```bash
git add apps/site
git commit -m "feat(site): add guest favorites backed by local storage"
```

---

### Task 7: Lists and share links

**Files:**
- Modify: `apps/site/src/collections/Lists.ts`
- Modify: `apps/site/src/access/lists.ts`
- Modify: `apps/site/src/access/lists.test.ts`
- Create: `apps/site/src/access/shareTokens.int.test.ts`
- Create: `apps/site/src/app/(frontend)/[locale]/lists/[shareToken]/page.tsx`
- Create: `apps/site/src/migrations/<timestamp>_share_token_defaults.ts`

**Interfaces:**
- Consumes: `listReadAccess`, `listUpdateAccess`, `listDeleteAccess`, `isListOwnerField` from Stage 1 Task 5.
- Produces: token minting on the `lists` collection; `visibility`-aware access filters.

**This closes the four gaps recorded in the spec under "Sharing is inert until Stage 3".** Read that section before starting.

- [ ] **Step 1: Mint the tokens**

Nothing currently writes `viewShareToken` or `editShareToken`, so both columns are always NULL and every share link is inert. Add a `beforeChange` collection hook that generates both with `crypto.randomUUID()` when a list is first created.

Keep the tokenless guard in `listReadAccess` / `listUpdateAccess` (`if (!token) return false;`). It is load-bearing for a different reason than the NULL columns: without it a tokenless request builds `{ equals: undefined }` and matches every private list.

- [ ] **Step 2: Let a signed-in user follow a share link**

Both access functions short-circuit on `if (req.user)` and return `{ owner: { equals: req.user.id } }`, so an authenticated recipient of a share link sees nothing. Change the signed-in branch to widen rather than replace:

```ts
if (req.user) {
  const token = shareToken(req);
  if (!token) {
    return { owner: { equals: req.user.id } };
  }
  return {
    or: [{ owner: { equals: req.user.id } }, { viewShareToken: { equals: token } }],
  };
}
```

Test both halves: a signed-in non-owner *with* the token sees the list, and *without* it does not.

- [ ] **Step 3: Make un-sharing revoke — Review Focus item 4**

`visibility` is never consulted, so setting a list back to `private` does not revoke a link that is already out. Choose rotation over an extra filter clause: an `afterChange` hook that regenerates both tokens whenever `visibility` transitions to `private`. Two mechanisms that can disagree is the worse option.

```ts
it("stops honouring a share link after the list is made private", async () => {
  const before = await readWithToken(list.viewShareToken);
  expect(before.docs).toHaveLength(1);

  await payload.update({ collection: "lists", id: list.id, data: { visibility: "private" }, overrideAccess: true });

  const after = await readWithToken(before.viewShareToken);
  expect(after.docs).toHaveLength(0);
});
```

- [ ] **Step 4: The share route**

`/[locale]/lists/[shareToken]` reads the list by token with `overrideAccess: false`, passing the token through `req.searchParams` so the access filter sees it. A bad token renders a friendly "this link is no longer valid" page, not a 500.

- [ ] **Step 5: Mutation-prove each guard**

At minimum: swap `viewShareToken` for `editShareToken` in the read filter; drop the `or` so a signed-in user cannot use a token; remove the rotation hook. Each must fail a named test.

- [ ] **Step 6: Commit**

```bash
git add apps/site
git commit -m "feat(site): make list sharing work end to end"
```

---

### Task 8: Referential integrity for lists

**Files:**
- Modify: `apps/site/src/collections/Lists.ts`
- Modify: `apps/site/src/collections/Users.ts`
- Create: `apps/site/src/hooks/cascadeListsOnUserDelete.ts`
- Create: `apps/site/src/collections/Lists.delete.int.test.ts`
- Create: `apps/site/src/migrations/<timestamp>_list_fk_behaviour.ts`

**Interfaces:**
- Consumes: the `lists` collection.
- Produces: `cascadeListsOnUserDelete` (a `CollectionBeforeDeleteHook` on `users`).

The spec's "Referential integrity" section rules on all four instances; Stage 1 closed two. These are the remaining two:

| Reference | Behaviour | Why |
|---|---|---|
| `lists.owner` | Cascade — delete the user, delete their lists | A private list has no meaning without its owner, and ownerless rows strand where no access filter reaches them |
| `lists.items.gesture` | Drop the array row | The list survives, it just loses an entry |

- [ ] **Step 1: Write the failing test — Review Focus item 5**

Against a real database, the way Stage 1's equivalent tests do it. A schema assertion cannot distinguish a working `ON DELETE` from one SQLite rejects at runtime — that is how this defect got written four times.

```ts
it("deletes a user's lists along with the user", async () => { /* ... */ });
it("drops a deleted gesture from every list that held it, keeping the list", async () => { /* ... */ });
it("leaves the list's other items in their original order", async () => { /* ... */ });
```

The third is the one that catches a cascade implemented by rebuilding the array.

- [ ] **Step 2: Run to confirm it fails**

Expected: `Failed query: delete from "gestures" ...` — the raw error, which is the bug.

- [ ] **Step 3: Implement**

`cascadeListsOnUserDelete` on `users`; extend the existing `beforeDelete` on `gestures` to strip the gesture from every list's `items` before the delete proceeds. The gesture hook already refuses when a sponsorship references it (Stage 1); the list behaviour is different — drop, don't refuse — so the two must not be conflated.

- [ ] **Step 4: Generate the migration, verify it replays**

`apps/site/src/migrations/migrations.test.ts` replays the whole chain against real SQLite and must still pass. `bunx payload migrate:create` mangles `migrations/index.ts` — it rebuilds the barrel from every `.ts` file and emits an invalid `import * as migration_migrations.test`. Revert the barrel and add the entry by hand.

- [ ] **Step 5: Commit**

```bash
git add apps/site
git commit -m "fix(site): finish the referential-integrity ruling for lists"
```

---

### Task 9: Metadata, sitemap and the stage exit

**Files:**
- Create: `apps/site/src/app/(frontend)/sitemap.ts`
- Create: `apps/site/src/app/(frontend)/robots.ts`
- Modify: `apps/site/src/app/(frontend)/[locale]/layout.tsx`
- Create: `apps/site/tests/e2e/a11y.spec.ts`

- [ ] **Step 1: Sitemap**

Emit every active gesture in every locale with `alternates`. Query with `overrideAccess: false` as an anonymous request, so an inactive gesture cannot reach the sitemap even if someone later loosens the page.

Test that an inactive gesture is absent. That is the assertion that catches an `overrideAccess: true` slipping in.

- [ ] **Step 2: Accessibility smoke test**

One Playwright spec per page type asserting: a single `<h1>`, every image has alt text, the page is reachable by keyboard to its primary action, and no element has a positive `tabindex`. This is a floor, not an audit.

- [ ] **Step 3: Put the e2e suite in CI, or say why not**

Stage 2 left this open deliberately: the only guard that would have caught
`max-w-lg` collapsing to 24px reads the *compiled stylesheet in a real
browser*, and it runs solely under `test:e2e`, which CI does not run. A guard
nobody executes is documentation.

Task 1 fixed the script, so the reason not to is gone. Add a `site-e2e` job to
`.github/workflows/ci.yml`, modelled on the existing jobs, that installs
Playwright's browsers (CI may run `playwright install --with-deps chromium`;
the sandbox restriction is local only), builds the site and runs the suite.

Two things decide whether this is worth it, and you must measure rather than
assume:

- **Runtime.** Time the suite. `release-check` already takes ~4 minutes. If
  e2e roughly doubles the wall clock for the whole pipeline, run it as a
  separate parallel job (which the existing layout already supports) rather
  than appending it to `release-check`.
- **Flakiness.** Run the suite five times in a row. A browser suite that fails
  one run in five will be ignored within a week and then disabled, which is
  worse than not having it. If it flakes, fix the flake or leave it out of CI
  and say so — do not land a job you expect to be red sometimes.

Report the timing and the five-run result either way. If you conclude it
should not go in CI, that is an acceptable answer *with evidence*; update the
"Carried out of Stage 2" section of the spec to say so, so the next person does
not rediscover the question.

- [ ] **Step 4: Measure the bundle**

Run `bun -F site check-bundle-size` and append a row to `docs/superpowers/specs/2026-09-19-stage-0-findings.md`. Entering this stage it is 7,178.17 KiB (70.1%); CI warns at 8 MiB. If this stage crosses the warn threshold, say so explicitly rather than letting CI announce it.

- [ ] **Step 5: Commit**

```bash
git add apps/site docs .github
git commit -m "feat(site): add sitemap, robots and the Stage 3 exit checks"
```

---

## Stage 3 exit criteria

1. `/nl/gestures`, `/en/gestures` and `/fr/gestures` all render content, including for gestures that exist only in Dutch.
2. Filtering, searching and pagination happen in the database, not in the browser.
3. A gesture detail page renders its video and 404s when inactive.
4. Guest favorites survive a reload and degrade silently in private browsing.
5. A share link works for anonymous and signed-in recipients, and stops working when the list is made private.
6. Deleting a user removes their lists; deleting a gesture removes it from lists without destroying them.
7. The migration chain replays clean against real SQLite.
8. `bun release:check` passes; `bun -F site test:e2e` runs and passes, and there is a recorded decision — with timing and a five-run flake check — on whether CI runs it.
9. The bundle is measured and recorded.
