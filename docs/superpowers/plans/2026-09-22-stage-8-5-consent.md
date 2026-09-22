# Stage 8.5: Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `user-consents` the first production writer it has ever had, behind a
cookie and analytics banner on `apps/site`, and port OpenPanel onto the new stack so
that the banner governs real tracking rather than a promise of it.

**Architecture:** A guest's choice lives in `localStorage` as a tri-state
(`"granted"` / `"denied"` / `null`-for-undecided) and is reconciled into a `user-consents`
row when a session exists — the same shape `GuestFavoritesSync` already uses for
favourites, chosen so that no unauthenticated write endpoint has to exist on an app
that has no rate limiting. Analytics is relayed through a Payload endpoint rather
than called from the browser, so the vendor credentials stay server-side, and the
relay refuses anything the consent store did not authorise. The banner itself is a
new non-modal `Banner` primitive in `@smog/ui-web`, because the library today has no
surface that is neither a modal dialog nor a toast.

**Tech Stack:** Payload 3.89.0, Next.js 16 App Router, Cloudflare Workers via
`@opennextjs/cloudflare`, D1, `@openpanel/web`, Vitest 5 + jsdom, Playwright.

**Spec:** [`../specs/2026-09-19-payload-migration-design.md`](../specs/2026-09-19-payload-migration-design.md)

---

## Global Constraints

Copied verbatim from the spec and from shipped source. Every task's requirements
implicitly include this section.

- **Payload is pinned at 3.89.0.** 3.90.x raises PBKDF2 to 600,000 iterations and
  workerd caps at 100,000. Do not upgrade it to fix anything in this stage.
- **There are no transactions.** `sqliteD1Adapter` is built without
  `transactionOptions`; `beginTransaction` resolves to `null`. Ordering is the only
  tool available.
- **A `where` on an update is a SELECT.** Read-modify-write races are not prevented
  by a filter.
- **A unique index is the only atomic primitive.** Anything that must happen exactly
  once claims a row in a table with a unique constraint first.
- **Payload's `defaultAccess` is `Boolean(user)`.** An omitted access rule is an open
  rule. Two vulnerabilities have already shipped from this. Every new collection and
  every new field-level rule states all four operations explicitly.
- **`user-consents` denies `create`, `update` and `delete` to everyone, admins
  included** (`apps/site/src/collections/UserConsents.ts:26-31`). The only door is the
  local API with `overrideAccess: true`. That is the point, not an oversight.
- **`analytics_consent` is `integer DEFAULT false NOT NULL`**
  (`apps/site/src/migrations/20260919_212934_add_sponsorships_and_audit.ts:102`, and
  again at `20260919_222612_nullable_consent_user.ts:31`). A row that omits the column
  records an explicit refusal. Never write a consent row without setting it.
- **`analyticsConsent` is `required` in Payload's sense — "must be a boolean", not
  "must be true".** An explicit refusal is recordable and is the case that matters
  most.
- **`user_consents.user` is nullable on purpose,** so a record outlives the account it
  describes. Never make it required.
- **The site has no i18n library and no message files.** Locale-varying copy is a
  `Record<Locale, string>` map at the call site — the shipped convention
  (`LocaleSwitcher.tsx:11`, `[locale]/layout.tsx:21`, `email/render.ts:102`).
  `apps/site` does **not** depend on `@smog/i18n`; do not add it in this stage.
- **`Locale` is `"nl" | "en" | "fr"`, default `"nl"`** (`apps/site/src/lib/locale.ts:11-15`).
- **`@testing-library/react` is not a declared dependency of `apps/site`.** It is
  hoisted transitively by `@smog/ui-web`, so importing it works at runtime and then
  fails knip. Site component tests use `react-dom/server`'s `renderToStaticMarkup`,
  or `createRoot` plus React's own `act`.
- **`packages/ui-web` puts `"use client"` on individual components, never on
  `src/index.ts`.** A directive there would make `cn()` a client boundary.
- **knip does not report unused exports from entry files.** `apps/site`'s entry is
  `src/app/**`, `src/payload.config.ts`, `src/seed/index.ts`, `scripts/*.ts` and the
  configs. An export added anywhere else must have an importer or it fails CI.
- **CI runs `bun release:check`**, which is `check:ci && release:config-check &&
  check-types && test && bun audit --production && native:release-check && build &&
  knip`. Run it before pushing. `expo-doctor`'s two sandbox failures (Expo config
  schema, React Native Directory) are environmental — confirm against CI rather than
  chasing them.

## Review Focus

The five failure modes this stage's tests must pin, written with the spec and the
shipped source in front of me. Each line names the task that owns its test.

1. **A visitor who never answers the banner must not be tracked, and must not be
   asked twice per navigation.** The store's undecided state is `null`, and `null` is
   not `false` — a truthy/falsy test (`if (consent)`) treats "undecided" and
   "declined" identically and would silently track nobody, or ask forever. Task 2
   owns this; its test asserts all three states distinctly, including that
   `readConsent()` returns `null` when the key is absent **and** when `localStorage`
   throws.
2. **A refusal must survive a sign-in.** Reconciliation writes a row from the local
   flag; a reconciler that only writes on `true` records nothing for the person who
   declined, and the next device they use has no record to read back. Task 6 owns
   this; its test signs in with a stored `false` and asserts a row exists with
   `analyticsConsent: false`.
3. **The relay must refuse what it is actually able to refuse, and must not pretend
   to more.** A guest's consent lives in the browser, so for an anonymous visitor
   there is nothing server-side to check — that is the cost of keeping guest consent
   local, and it is stated rather than papered over. What the relay *can* refuse it
   must: a cross-site post, an event the allowlist does not name, anything over the
   rate limit, and — when the request carries a session — an event whose account's
   most recent consent row says `false`. Task 5 owns this; its tests assert all four,
   and assert that a refusal never reaches the vendor. **The relay must not require a
   session**: guests are trackable once they grant consent, and a session requirement
   would track nobody who is not signed in.
4. **Two tabs must not disagree.** `setConsent` in one tab leaves another tab's
   in-memory cache stale, so a second tab keeps tracking after a refusal. Task 2 owns
   this; its test dispatches a `storage` event and asserts subscribers re-read.
5. **The banner must be reachable and dismissible by keyboard, and must not trap
   focus.** It is not a modal — a modal consent wall is both a dark pattern and a
   blocker for assistive technology. **Task 3** owns this — the property belongs to
   the `Banner` primitive, so its test asserts the container is a labelled
   `role="region"`, that Tab reaches a control inside and leaves again, and that focus
   is *not* forced into it on mount. Task 4 asserts only the site's use of it.

---

## File Structure

### New

| File | Responsibility |
|---|---|
| `packages/ui-web/src/components/Banner.tsx` | Non-modal, edge-anchored, labelled region. The library's first surface that is neither a dialog nor a toast. |
| `packages/ui-web/src/components/Banner.test.tsx` | Its behaviour, including the a11y properties Review Focus 5 names. |
| `apps/site/src/lib/consentStore.ts` | The tri-state client store, its subscribers, and the cross-tab listener. No React. |
| `apps/site/src/lib/consentStore.test.ts` | Review Focus 1 and 4. |
| `apps/site/src/lib/analytics.ts` | The browser-side client: the consent gate and the relay call. No vendor SDK in the bundle. |
| `apps/site/src/lib/analytics.test.ts` | That a gate closed means nothing is sent. |
| `apps/site/src/components/ConsentBanner.tsx` | The site's use of `Banner`: copy per locale, the two choices, and what it does with them. |
| `apps/site/src/components/ConsentBanner.test.tsx` | Rendering, the three states, and the locale map. |
| `apps/site/src/components/ConsentSync.tsx` | The zero-markup client leaf that reconciles a guest's stored choice on sign-in. Mirrors `GuestFavoritesSync`. |
| `apps/site/src/endpoints/consent.ts` | `POST /api/consent` (session required) and the shared `decideConsent`. |
| `apps/site/src/endpoints/consent.int.test.ts` | The write path, the access floor, and Review Focus 2. |
| `apps/site/src/endpoints/analytics.ts` | `POST /api/analytics/track`: the relay, its consent check and its rate limit. |
| `apps/site/src/endpoints/analytics.int.test.ts` | Review Focus 3, plus the limiter. |
| `apps/site/src/collections/RateLimits.ts` | The claim table the limiter stands on. A unique index is the only atomic primitive available. |
| `apps/site/src/lib/rateLimit.ts` | `claim(namespace, key, limit, windowSeconds)` over that table. |
| `apps/site/src/lib/rateLimit.int.test.ts` | That the limit actually holds under concurrency. |
| `apps/site/src/app/(frontend)/[locale]/privacy/page.tsx` | The policy the banner links to. A banner that links nowhere is not consent. |

### Modified

| File | Change |
|---|---|
| `packages/ui-web/src/index.ts` | Export `Banner`, `bannerVariants`, `BannerProps`. |
| `apps/site/src/app/(frontend)/[locale]/layout.tsx:193` | Mount `ConsentBanner` and `ConsentSync` beside `GuestFavoritesSync`. |
| `apps/site/src/payload.config.ts` | Register `RateLimits`, `consentEndpoints`, `analyticsEndpoints`. |
| `apps/site/src/app/(frontend)/[locale]/account/page.tsx` | The re-toggle. Consent that cannot be withdrawn is not consent. |
| `apps/site/wrangler.jsonc` | The OpenPanel vars. |
| `.github/workflows/ci.yml` | Split `site#test` out of `release-check`. See Task 1. |
| `docs/COMPONENTS.md` | It documents `@smog/ui`, a package `apps/site` does not depend on. Task 3 fixes or deletes it. |

---

## Task 1: Split the site suite out of `release-check`

Stage 8's exit assigned this here. Three intermittent CI kills landed on the Stage 8
branch, two of them the same miniflare fault:

| commit | job | symptom |
|---|---|---|
| `9354283` | `site#test` | `assert (message?.id === id)` at `miniflare/src/plugins/core/proxy/fetch-sync.ts:147` |
| `293e5b2` | `mobile#test` | exit 130 — SIGINT, a killed process |
| `1bfb970` | `site#test` | the same assert, 10 files / 44 tests |

**This task does not claim to fix that fault, and no step below pretends to verify a
fix.** The fault has never once reproduced in this sandbox — two full site runs during
Stage 8's exit mutation were clean — so a local measurement would prove nothing. What
this task does is reduce the load that correlates with it and make the next occurrence
diagnosable, with a prediction attached that a future occurrence can falsify.

**The prediction, recorded so it can be wrong:** if the desync recurs in a job that is
running *only* the site suite, then contention with the other nine `release:check`
tasks was not the cause, and the next move is the `isolate: false` experiment described
in Step 4 — not a third re-run.

**Files:**
- Modify: `.github/workflows/ci.yml:17-25`
- Modify: `package.json:58`
- Create: `docs/superpowers/plans/2026-09-22-stage-8-5-consent.md` (this file, appended at Task 8)

**Interfaces:**
- Consumes: nothing.
- Produces: a `site-tests` CI job name that Task 8's exit assessment reads; a
  `release:check:ci` script that `release-check` runs. (The name is the one in
  Step 2's code block; an earlier draft of this line said `release:check:no-site`,
  which was never the literal anywhere.)

- [ ] **Step 1: Read what exists before changing it**

Run: `sed -n '1,30p' .github/workflows/ci.yml && sed -n '80,95p' .github/workflows/ci.yml`

The `site-e2e` job's own comment is the precedent this task follows:

> It is its own job rather than another step in `release-check` because it is about
> as long as that job is, and the two have no reason to be serial.

That comment is the argument. Do not write a new one that says the same thing worse.

- [ ] **Step 2: Add the split script**

In `package.json`, beside the existing `release:check`, add a variant that excludes
the site test task, and leave `release:check` itself untouched so a developer running
it locally still gets everything:

```json
    "release:check:ci": "bun run check:ci && bun run release:config-check && bun run check-types && turbo test --filter=!site && bun audit --production && bun run native:release-check && bun run build && knip --no-progress --no-config-hints",
```

Verify the filter does what you think before relying on it:

Run: `bunx turbo test --filter='!site' --dry-run=json | python3 -c "import json,sys; print([t['taskId'] for t in json.load(sys.stdin)['tasks']])"`
Expected: a list containing `ui-web#test`, `mobile#test`, `ui-native#test` and **not**
`site#test`. If `site#test` is present the filter syntax is wrong for this Turborepo
version — fix it here rather than discovering it in CI.

- [ ] **Step 3: Split the job**

In `.github/workflows/ci.yml`, change `release-check`'s last step to run the new
script, and add a sibling job:

```yaml
  # Split out of `release-check` on 2026-09-22, after three intermittent CI kills on
  # the Stage 8 branch — two of them miniflare's sync-proxy desync
  # (`assert (message?.id === id)`, fetch-sync.ts:147), which took down 10 files and
  # 44 tests on `1bfb970` and then passed on the next commit untouched.
  #
  # The fault has never reproduced outside CI, so this is not a fix and is not
  # claimed as one: it is the load reduction the Stage 8 exit assigned, and it is
  # falsifiable. If the desync recurs HERE — in a job running nothing but the site
  # suite — then contention with the other release:check tasks was not the cause,
  # and the next step is vitest's `isolate` setting rather than another re-run.
  site-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: package.json
      - run: bun install --frozen-lockfile
      - run: bun -F site test
```

- [ ] **Step 4: Record the experiment that comes next, without running it**

Append to this plan, under Task 1, the exact change a future occurrence licenses, so
that whoever hits it does not re-derive the diagnosis:

```md
If the desync recurs in `site-tests`, set `isolate: true` in
`apps/site/vitest.config.mts` and measure the wall-clock cost of the site suite
before and after. The hypothesis it tests: that config's own comment justifies
`isolate: false` on *disk* safety — per-worker D1 persistence directories keyed by
`VITEST_WORKER_ID` — and disk is not the channel that failed. Miniflare's sync proxy
is per-process, and `isolate: false` puts several files' Payload instances and D1
stubs in one process at once, which is the shape a request/response id mismatch takes.
```

- [ ] **Step 5: Verify the workflow parses and the scripts run**

Run: `python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/ci.yml')); print(sorted(d['jobs']))"`
Expected: a list including both `release-check` and `site-tests`.

Run: `bun run check:ci`
Expected: exit 0. Biome lints `package.json` and the workflow's sibling files.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml package.json docs/superpowers/plans/2026-09-22-stage-8-5-consent.md
git commit -m "ci: run the site suite in its own job, with a prediction attached"
```

**The experiment a recurrence licenses:**

If the desync recurs in `site-tests`, set `isolate: true` in
`apps/site/vitest.config.mts` and measure the wall-clock cost of the site suite
before and after. The hypothesis it tests: that config's own comment justifies
`isolate: false` on *disk* safety — per-worker D1 persistence directories keyed by
`VITEST_WORKER_ID` — and disk is not the channel that failed. Miniflare's sync proxy
is per-process, and `isolate: false` puts several files' Payload instances and D1
stubs in one process at once, which is the shape a request/response id mismatch takes.

---

## Task 2: The consent store

The tri-state that the whole stage hangs on. `null` is not `false`: "has not
answered" and "said no" are different facts, and the column this eventually writes
(`analytics_consent integer DEFAULT false NOT NULL`) cannot represent the difference,
which is exactly why the browser must.

**Files:**
- Create: `apps/site/src/lib/consentStore.ts`
- Create: `apps/site/src/lib/consentStore.test.ts`

**Interfaces:**
- Consumes: nothing. This module imports nothing from the app and nothing from
  Payload — Task 5's client half imports it, and a runtime edge into Payload would
  drag the D1/drizzle graph into a browser chunk (`lib/mergeGuestState.ts:19-27`
  measured that at 519 KiB).
- Produces, and later tasks rely on these names exactly:

```ts
// NOT exported, either of them — see below.
type ConsentChoice = "granted" | "denied";
/** `null` means the visitor has not answered. It is not a refusal. */
type ConsentState = ConsentChoice | null;
export const ANALYTICS_CONSENT_KEY = "smog.consent.analytics";
export function readConsent(): ConsentState;
export function writeConsent(choice: ConsentChoice): void;
export function clearConsent(): void;
export function subscribeConsent(listener: () => void): () => void;
```

**Neither type is exported by this task**, and that is a CI requirement rather than a
style preference. knip runs inside `bun release:check` and fails on an exported symbol
nothing imports; `ConsentChoice` has no importer anywhere in this plan, and
`ConsentState`'s first importer arrives in Task 4. Task 4 adds `export` to
`ConsentState` in the same commit that introduces the import. Every commit on this
branch has to be individually green — AGENTS.md names this exact trap as the one that
catches people out.

- [ ] **Step 1: Write the failing test**

Create `apps/site/src/lib/consentStore.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_CONSENT_KEY,
  clearConsent,
  readConsent,
  subscribeConsent,
  writeConsent,
} from "./consentStore";

describe("consentStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /*
   * Review Focus 1. The three states are asserted against each other rather
   * than one at a time: the bug this guards is `if (consent)`, which collapses
   * `null` and `"denied"` into one branch and reads identically in a diff.
   */
  it("tells undecided, granted and denied apart", () => {
    expect(readConsent()).toBeNull();

    writeConsent("granted");
    expect(readConsent()).toBe("granted");

    writeConsent("denied");
    expect(readConsent()).toBe("denied");

    clearConsent();
    expect(readConsent()).toBeNull();
  });

  it("treats a value it did not write as undecided", () => {
    // An older build, another tab, a hand-edited store. `JSON.parse` would be
    // happy with any of these; this module is not.
    for (const junk of ["true", "false", "1", "", "GRANTED", "{}"]) {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, junk);
      expect(`${junk} -> ${readConsent()}`).toBe(`${junk} -> null`);
    }
  });

  it("reports undecided rather than throwing when storage is unreadable", () => {
    // Private browsing: the getter itself throws, before any method is called.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const spy = vi
      .spyOn(window, "localStorage", "get")
      .mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });

    expect(readConsent()).toBeNull();
    expect(() => writeConsent("granted")).not.toThrow();

    spy.mockRestore();
    expect(warn).toHaveBeenCalled();
  });

  it("notifies subscribers when this tab writes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeConsent(listener);

    writeConsent("granted");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    writeConsent("denied");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  /*
   * Review Focus 4. `storage` fires in every OTHER tab, never the one that
   * wrote, so a store that only notifies on its own writes leaves a second tab
   * tracking after a refusal — and nothing in a single-tab test would show it.
   */
  it("notifies subscribers when another tab writes", () => {
    const listener = vi.fn();
    subscribeConsent(listener);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: ANALYTICS_CONSENT_KEY,
        newValue: "denied",
      })
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(readConsent()).toBeNull(); // the event carries the value; the store re-reads
  });

  it("ignores a storage event for an unrelated key", () => {
    const listener = vi.fn();
    subscribeConsent(listener);

    window.dispatchEvent(
      new StorageEvent("storage", { key: "smog.guest.favorites", newValue: "[]" })
    );

    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail for the right reason**

Run: `bun -F site test src/lib/consentStore.test.ts`
Expected: FAIL — `Failed to resolve import "./consentStore"`. If it fails any other
way, the test file is wrong, not the missing module.

- [ ] **Step 3: Write the implementation**

Create `apps/site/src/lib/consentStore.ts`:

```ts
/**
 * What the visitor has said about analytics, in this browser.
 *
 * ## Why a tri-state and not a boolean
 *
 * `null` means "has not answered". It is not a refusal, and the difference is
 * the whole reason this module exists: `user_consents.analytics_consent` is
 * `integer DEFAULT false NOT NULL`, so a row that omits the column records an
 * explicit *no*. The database cannot hold "no answer yet", so the browser has
 * to, and the banner's whole job is to turn the `null` into one of the other
 * two.
 *
 * ## Why localStorage and not a cookie
 *
 * A cookie is sent on every request to this origin, including every image and
 * every Payload admin call, which is a cost paid forever for a value the
 * server reads once — and a consent cookie that the server can see is a
 * cookie that has to be declared in the very banner it powers. The server
 * learns the answer when there is an account to attach it to, and not before
 * (see `components/ConsentSync.tsx`).
 *
 * Nothing here imports Payload, or anything that does. A runtime edge into
 * `payload.config` would put the D1/drizzle graph in a browser chunk — the
 * 519 KiB `lib/mergeGuestState.ts:19-27` measured.
 */

/**
 * Namespaced the way `GUEST_FAVORITES_KEY` is, and for the same reason: the
 * public site, the Payload admin and anything else this Worker serves share
 * one origin and therefore one `localStorage`.
 *
 * Deliberately NOT the old stack's key. `apps/web` uses
 * `"smog_analytics_consent"` and `apps/native` uses `"@smog_analytics_consent"`
 * (`packages/config/src/constants.ts:96`) — two different keys for one
 * decision, which is a bug this migration does not carry over. The new site
 * never runs on the same origin as `apps/web`, so there is nothing to read
 * back and nothing to collide with.
 */
export const ANALYTICS_CONSENT_KEY = "smog.consent.analytics";

/** An answer the visitor actually gave. */
export type ConsentChoice = "denied" | "granted";

/** `null` means the visitor has not answered. It is not a refusal. */
export type ConsentState = ConsentChoice | null;

const listeners = new Set<() => void>();

/**
 * The store, or `null` when there is not one we are allowed to touch.
 *
 * Three cases collapse into that `null` and all three are normal: server-side
 * rendering, private browsing, and blocked site data. `lib/guestStore.ts:48`
 * carries the full argument; this is the same shape deliberately, so that one
 * reading teaches both.
 */
function openStore(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch (error) {
    console.warn("[consentStore] Failed to open localStorage:", error);
    return null;
  }
}

/** Anything this module did not write is treated as no answer at all. */
function parse(raw: null | string): ConsentState {
  if (raw === "granted" || raw === "denied") {
    return raw;
  }

  return null;
}

export function readConsent(): ConsentState {
  const store = openStore();

  if (store === null) {
    return null;
  }

  try {
    return parse(store.getItem(ANALYTICS_CONSENT_KEY));
  } catch (error) {
    console.warn("[consentStore] Failed to read consent:", error);
    return null;
  }
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function writeConsent(choice: ConsentChoice): void {
  const store = openStore();

  if (store !== null) {
    try {
      store.setItem(ANALYTICS_CONSENT_KEY, choice);
    } catch (error) {
      // `setItem` throws `QuotaExceededError` in private browsing even when
      // the getter did not. The visitor still answered; the banner still has
      // to close, and the relay still has to honour it for this page view.
      console.warn("[consentStore] Failed to persist consent:", error);
    }
  }

  notify();
}

export function clearConsent(): void {
  const store = openStore();

  if (store !== null) {
    try {
      store.removeItem(ANALYTICS_CONSENT_KEY);
    } catch (error) {
      console.warn("[consentStore] Failed to clear consent:", error);
    }
  }

  notify();
}

/**
 * Subscribe to changes, in this tab and in every other one.
 *
 * The `storage` event fires in every tab EXCEPT the one that wrote, so both
 * halves are needed: `notify()` covers this tab, the listener covers the
 * others. A store with only the first keeps a second tab tracking after a
 * refusal, and no single-tab test would ever show it.
 *
 * Shaped for `useSyncExternalStore`: subscribe returns its own unsubscribe.
 */
export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === ANALYTICS_CONSENT_KEY) {
      listener();
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    listeners.delete(listener);

    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `bun -F site test src/lib/consentStore.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Prove the tri-state assertion can fail**

Mutation: in `parse`, change `if (raw === "granted" || raw === "denied")` to
`if (raw !== null)`.

Run: `bun -F site test src/lib/consentStore.test.ts`
Expected: FAIL — "treats a value it did not write as undecided", on the first junk
value. Restore byte for byte and confirm `git diff src/lib/consentStore.ts` is empty
and the suite is 6/6 again.

A second mutation, because the first does not exercise Review Focus 4: delete the
`window.addEventListener("storage", onStorage)` line.

Run: `bun -F site test src/lib/consentStore.test.ts`
Expected: FAIL — "notifies subscribers when another tab writes". Restore and re-verify.

- [ ] **Step 6: Commit**

```bash
bun x biome check --write apps/site/src/lib/consentStore.ts apps/site/src/lib/consentStore.test.ts
git add apps/site/src/lib/consentStore.ts apps/site/src/lib/consentStore.test.ts
git commit -m "feat(site): the consent store, where undecided is not a refusal"
```

---

## Task 3: `Banner`, the library's first non-modal surface

`@smog/ui-web` has no surface that is neither a modal dialog nor a toast. Verified by
reading the package: **`Banner`, `Alert`, `AlertDialog`, `Popover`, `Text`,
`Typography` and `Link` do not exist.** `Sheet side="bottom"` is the only
edge-anchored component and it mounts `<DialogOverlay />` unconditionally
(`Sheet.tsx:79`) with no prop to suppress it — a full-page scrim over a consent
prompt is a modal consent wall, which is both a dark pattern and a barrier for
assistive technology.

So this task adds the primitive rather than misusing an existing one. It belongs in
the library, not in the site, because a cookie notice, a service-status notice and a
"your sponsorship expires in three days" notice are the same surface.

**Do not cite `docs/COMPONENTS.md`.** It documents `packages/ui/src/` and claims
components are re-exported from `@smog/ui` — a legacy package `apps/site` does not
depend on (`apps/site/package.json:33` lists `@smog/ui-web` only). Step 6 deals with it.

**Files:**
- Create: `packages/ui-web/src/components/Banner.tsx`
- Create: `packages/ui-web/src/components/Banner.test.tsx`
- Modify: `packages/ui-web/src/index.ts`

**Interfaces:**
- Consumes: `cn` from `../lib/cn`; `cva`/`VariantProps` from `class-variance-authority`.
- Produces:

```ts
export const bannerVariants: (props?: { placement?: "bottom" | "top" }) => string;
export type BannerProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof bannerVariants> & {
    /** Names the region for assistive technology. Required — an unnamed landmark is noise. */
    label: string;
  };
export function Banner(props: BannerProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

Create `packages/ui-web/src/components/Banner.test.tsx`. Note the conventions this
package uses and this file must follow: Vitest 4.1.11 + jsdom, **no `jest-dom`**, and
class assertions go through the `classesOf` split-list helper rather than string
matching (`Dialog.test.tsx:17-23`).

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Banner } from "./Banner";

const classesOf = (element: Element) =>
  (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

describe("Banner", () => {
  /*
   * Review Focus 5, first half. A landmark with no name is a landmark a
   * screen-reader user cannot tell from any other, so `label` is required and
   * this asserts it actually lands on the element.
   */
  it("is a region with an accessible name", () => {
    render(<Banner label="Cookiemelding">Inhoud</Banner>);

    const region = screen.getByRole("region", { name: "Cookiemelding" });
    expect(region.textContent).toBe("Inhoud");
  });

  /*
   * Review Focus 5, second half, and the reason this component exists rather
   * than a `Sheet side="bottom"`. A consent prompt that steals focus on mount
   * interrupts whatever the visitor was doing; one that traps focus is a wall.
   * Both are asserted as ABSENCES, which is why the control render below is
   * needed — `document.activeElement` being `body` proves nothing unless
   * something in the test could have changed it.
   */
  it("does not take focus on mount, and does not trap it", async () => {
    const user = userEvent.setup();

    render(
      <>
        <button type="button">Buiten</button>
        <Banner label="Cookiemelding">
          <button type="button">Binnen</button>
        </Banner>
      </>
    );

    expect(document.activeElement).toBe(document.body);

    const outside = screen.getByRole("button", { name: "Buiten" });
    const inside = screen.getByRole("button", { name: "Binnen" });

    // Focus reaches the banner's control by keyboard...
    await user.tab();
    expect(document.activeElement).toBe(outside);
    await user.tab();
    expect(document.activeElement).toBe(inside);

    // ...and leaves it again, which a focus trap would prevent.
    await user.tab();
    expect(document.activeElement).not.toBe(inside);
  });

  it("renders no scrim", () => {
    const { container } = render(<Banner label="Cookiemelding">Inhoud</Banner>);

    // The one thing `Sheet` would have added. Asserted structurally rather
    // than by class name so it survives a restyle.
    expect(container.querySelectorAll("[data-radix-portal]")).toHaveLength(0);
    expect(document.body.style.pointerEvents).toBe("");
  });

  it("anchors to the bottom by default and to the top on request", () => {
    const { rerender } = render(<Banner label="A">x</Banner>);
    const bottom = classesOf(screen.getByRole("region"));

    rerender(
      <Banner label="A" placement="top">
        x
      </Banner>
    );
    const top = classesOf(screen.getByRole("region"));

    expect(bottom).toContain("bottom-0");
    expect(top).toContain("top-0");
    expect(bottom).not.toEqual(top);
  });

  it("puts the caller's className last so it can override", () => {
    render(
      <Banner className="bg-danger" label="A">
        x
      </Banner>
    );

    expect(classesOf(screen.getByRole("region"))).toContain("bg-danger");
  });

  it("spreads the rest of its props onto the region", () => {
    const onClick = vi.fn();
    render(
      <Banner data-testid="consent" label="A" onClick={onClick}>
        x
      </Banner>
    );

    expect(screen.getByTestId("consent")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun -F @smog/ui-web test src/components/Banner.test.tsx`
Expected: FAIL — cannot resolve `./Banner`.

- [ ] **Step 3: Write the component**

Create `packages/ui-web/src/components/Banner.tsx`. `Button.tsx:8-17` declares itself
the reference shape for this package — exported cva, `cn(variants, className)` with
`className` last, props spread last — and this follows it.

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * A persistent, non-modal notice pinned to an edge of the viewport.
 *
 * ## Why this is not a `Sheet`
 *
 * `Sheet` is `@radix-ui/react-dialog` underneath and `SheetContent` mounts
 * `<DialogOverlay />` unconditionally (`Sheet.tsx:79`), so every sheet is
 * modal: a full-page scrim, a focus trap, and `pointer-events: none` on the
 * body. That is right for a destructive confirmation and wrong for a notice.
 * A cookie banner that traps focus is a consent wall — the visitor cannot
 * read the privacy policy the banner links to without first answering the
 * banner, which is precisely the pattern regulators call out.
 *
 * So this component is deliberately plain: a positioned `<div>` with a
 * landmark role and a name. No portal, no scrim, no focus management. The
 * page underneath stays usable, and the banner is reachable in tab order
 * because it is in the document, not over it.
 *
 * ## Why `label` is required
 *
 * `role="region"` without an accessible name is not exposed as a landmark at
 * all — the name is what makes it navigable. A required prop is cheaper than
 * a lint rule nobody runs.
 */
export const bannerVariants = cva(
  "fixed inset-x-0 z-40 flex flex-col gap-3 border-border-subtle bg-surface-raised p-4 text-foreground shadow-lg sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-6",
  {
    variants: {
      placement: {
        bottom: "bottom-0 border-t",
        top: "top-0 border-b",
      },
    },
    defaultVariants: { placement: "bottom" },
  }
);

export type BannerProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof bannerVariants> & {
    /**
     * Names the region for assistive technology. Required: an unnamed
     * landmark is not a landmark.
     */
    label: string;
  };

export function Banner({
  children,
  className,
  label,
  placement,
  ...props
}: BannerProps) {
  return (
    /*
     * `z-40`, below `Dialog`'s and `Sheet`'s `z-50`: if a modal opens while
     * this is showing, the modal is the thing being answered and the notice
     * belongs behind its scrim.
     */
    <section
      aria-label={label}
      className={cn(bannerVariants({ placement }), className)}
      {...props}
    >
      {children}
    </section>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `bun -F @smog/ui-web test src/components/Banner.test.tsx`
Expected: PASS, 6 tests.

Note on the role: a `<section>` with an accessible name **is** `role="region"` in the
accessibility tree, which is why the test queries `getByRole("region", { name })`
rather than asserting a literal attribute. If that query fails, do not add
`role="region"` to silence it — find out why the name is not landing, because the
same cause would hide the landmark from a real screen reader.

- [ ] **Step 5: Export it, and prove the export is reachable**

In `packages/ui-web/src/index.ts`, add to the component block (keep the alphabetical
order the file already uses):

```ts
export { Banner, bannerVariants, type BannerProps } from "./components/Banner";
```

Do **not** add `"use client"` to `index.ts`. The file's own comment at `:7-12`
explains that a directive there makes the whole library — `cn()` included — a client
boundary. `Banner` holds no state and needs no directive of its own.

Run: `bun -F @smog/ui-web check-types && bun -F @smog/ui-web test`
Expected: exit 0, and the package's full suite passing.

- [ ] **Step 6: Fix the stale component doc**

`docs/COMPONENTS.md:11-14` documents `packages/ui/src/`, and `:27-29` says components
are re-exported from `@smog/ui`. `apps/site` depends on `@smog/ui-web` only. A doc
that names a package the app does not use is how a plan ends up naming a file that
never existed — which already happened once this project, to Stage 8's criterion 6.

Read it, then either correct it to describe `@smog/ui-web` or delete it if `@smog/ui`
is Stage 10 demolition anyway. Record which you did and why in the commit message.

Run: `grep -rn "@smog/ui\"" apps packages --include=package.json`
Expected: this tells you who actually depends on the legacy package before you decide.

- [ ] **Step 7: Commit**

```bash
bun x biome check --write packages/ui-web/src docs/COMPONENTS.md
git add packages/ui-web/src/components/Banner.tsx packages/ui-web/src/components/Banner.test.tsx packages/ui-web/src/index.ts docs/COMPONENTS.md
git commit -m "feat(ui-web): Banner, a notice that does not trap the reader"
```

---

## Task 4: The banner the visitor actually sees

**Files:**
- Create: `apps/site/src/components/ConsentBanner.tsx`
- Create: `apps/site/src/components/ConsentBanner.test.tsx`
- Create: `apps/site/src/app/(frontend)/[locale]/privacy/page.tsx`
- Modify: `apps/site/src/app/(frontend)/[locale]/layout.tsx`

**Interfaces:**
- Consumes: `Banner` from `@smog/ui-web` (Task 3); `readConsent`, `subscribeConsent`,
  `writeConsent`, `type ConsentState` from `@/lib/consentStore` (Task 2);
  `type Locale` from `@/lib/locale`.
- **Also modifies `@/lib/consentStore`**: add the `export` keyword to `ConsentState`.
  Task 2 deliberately left both its types unexported so that its own commit passed
  knip; this is the commit that gives `ConsentState` an importer, so it is the commit
  that may export it. Leave `ConsentChoice` unexported — nothing imports it.
- Produces: `export function ConsentBanner({ locale }: { locale: Locale }): JSX.Element | null`.

**The copy already exists and does not need writing.** `packages/i18n/src/locales/*.json`
carries translated consent strings under `settings.*` — `analyticsPromptTitle`,
`analyticsPromptDescription`, `analyticsAllow`, `analyticsRequiredOnly`,
`privacyPolicy` — in all three locales (nl `analyticsPromptTitle` is
`"Help SMOG verbeteren"`, `analyticsAllow` is `"Analytics toestaan"`). **Copy the
strings, do not add the dependency**: `apps/site` does not depend on `@smog/i18n` and
this stage does not change that. Read the three JSON files, lift the five strings per
locale into the `Record<Locale, …>` map below, and keep the wording identical so the
two stacks say the same thing while they coexist.

- [ ] **Step 1: Write the failing test**

Create `apps/site/src/components/ConsentBanner.test.tsx`. This app has no
`@testing-library/react` (it would fail knip); use `createRoot` + `act`, the way
`FavoriteButton.test.tsx:1-7` does.

```tsx
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ANALYTICS_CONSENT_KEY } from "@/lib/consentStore";
import { ConsentBanner } from "./ConsentBanner";

describe("ConsentBanner", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const mount = (locale: "en" | "fr" | "nl" = "nl") => {
    act(() => {
      root.render(<ConsentBanner locale={locale} />);
    });
  };

  /*
   * The server cannot read localStorage, so the first client render must match
   * what the server produced — null — and the decision has to arrive in an
   * effect. `ThemeToggle.tsx:28-30` states the same rule: "rendering a guess
   * would be a hydration mismatch on every load."
   */
  it("shows nothing until it has read the store", () => {
    expect(renderToStaticMarkup(<ConsentBanner locale="nl" />)).toBe("");
  });

  it("asks an undecided visitor", () => {
    mount();
    expect(container.querySelector("section")).not.toBeNull();
    expect(container.textContent).toContain("Help SMOG verbeteren");
  });

  it("says nothing to a visitor who already answered, either way", () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    mount();
    expect(container.querySelector("section")).toBeNull();

    act(() => root.unmount());
    root = createRoot(container);
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "denied");
    mount();
    expect(container.querySelector("section")).toBeNull();
  });

  it("records a refusal as a refusal, not as silence", () => {
    mount();

    const decline = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("zonder analytics")
    );

    act(() => {
      decline?.click();
    });

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("denied");
    expect(container.querySelector("section")).toBeNull();
  });

  it("records an acceptance", () => {
    mount();

    const accept = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("toestaan")
    );

    act(() => {
      accept?.click();
    });

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("granted");
  });

  /*
   * Three locales, asserted against each other rather than one at a time: a
   * map whose three entries are the same string passes any single-locale
   * check, and "we shipped the Dutch copy to French readers" is exactly the
   * bug a consent notice cannot have.
   */
  it("speaks each locale, distinctly", () => {
    const rendered = new Set<string>();

    for (const locale of ["nl", "en", "fr"] as const) {
      act(() => root.unmount());
      root = createRoot(container);
      mount(locale);
      rendered.add(container.textContent ?? "");
    }

    expect(rendered.size).toBe(3);
  });

  it("links to the privacy policy for the locale being read", () => {
    mount("fr");

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/fr/privacy");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun -F site test src/components/ConsentBanner.test.tsx`
Expected: FAIL — cannot resolve `./ConsentBanner`.

- [ ] **Step 3: Write the component**

Create `apps/site/src/components/ConsentBanner.tsx`:

```tsx
"use client";

import { Banner, Button } from "@smog/ui-web";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  type ConsentState,
  readConsent,
  subscribeConsent,
  writeConsent,
} from "@/lib/consentStore";
import type { Locale } from "@/lib/locale";

/**
 * The cookie and analytics notice.
 *
 * ## Why it renders nothing on the server
 *
 * The answer lives in `localStorage`, which the server cannot read, so the
 * first client render has to match the empty markup the server produced and
 * the real state has to arrive in an effect. `state` therefore starts at
 * `undefined` — a fourth value, distinct from the store's three — meaning
 * "not yet read". `ThemeToggle.tsx:28-30` carries the same rule for the same
 * reason: "rendering a guess would be a hydration mismatch on every load".
 *
 * ## Why the strings are a map and not a translation call
 *
 * `apps/site` has no i18n library and every shipped component holds its copy
 * as a `Record<Locale, string>` at the call site (`LocaleSwitcher.tsx:11`,
 * `[locale]/layout.tsx:21`). The wording is copied from
 * `packages/i18n/src/locales/*.json`'s `settings.*` keys so that this notice
 * and the old stack's say the same thing while both are live; the dependency
 * is deliberately not added.
 */
const COPY: Record<
  Locale,
  {
    accept: string;
    decline: string;
    description: string;
    label: string;
    policy: string;
    title: string;
  }
> = {
  en: {
    accept: "Allow analytics",
    decline: "Use without analytics",
    description:
      "We use anonymous analytics to see which gestures people look for, so we can improve SMOG. You decide.",
    label: "Cookie notice",
    policy: "Privacy policy",
    title: "Help improve SMOG",
  },
  fr: {
    accept: "Autoriser les statistiques",
    decline: "Utiliser sans statistiques",
    description:
      "Nous utilisons des statistiques anonymes pour voir quels gestes sont recherchés, afin d'améliorer SMOG. C'est vous qui décidez.",
    label: "Avis relatif aux cookies",
    policy: "Politique de confidentialité",
    title: "Aidez-nous à améliorer SMOG",
  },
  nl: {
    accept: "Analytics toestaan",
    decline: "Gebruiken zonder analytics",
    description:
      "We gebruiken anonieme analytics om te zien welke gebaren mensen zoeken, zodat we SMOG kunnen verbeteren. Jij beslist.",
    label: "Cookiemelding",
    policy: "Privacybeleid",
    title: "Help SMOG verbeteren",
  },
};

export function ConsentBanner({ locale }: { locale: Locale }) {
  /** `undefined` is "not read yet"; `null` is "read, and they have not answered". */
  const [state, setState] = useState<ConsentState | undefined>(undefined);

  useEffect(() => {
    setState(readConsent());

    return subscribeConsent(() => {
      setState(readConsent());
    });
  }, []);

  if (state !== null) {
    return null;
  }

  const copy = COPY[locale];

  return (
    <Banner label={copy.label}>
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-foreground">{copy.title}</p>
        <p className="text-foreground-muted text-sm">
          {copy.description}{" "}
          <Link className="underline" href={`/${locale}/privacy`}>
            {copy.policy}
          </Link>
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
        <Button onClick={() => writeConsent("denied")} variant="secondary">
          {copy.decline}
        </Button>
        <Button onClick={() => writeConsent("granted")}>{copy.accept}</Button>
      </div>
    </Banner>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `bun -F site test src/components/ConsentBanner.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the privacy page the banner links to**

A banner linking to a 404 is not consent. Create
`apps/site/src/app/(frontend)/[locale]/privacy/page.tsx` following the shape of a
shipped localized page — read `[locale]/gestures/[id]/page.tsx` for the
`generateMetadata` / `isLocale` / `notFound()` conventions and copy them rather than
inventing a variant.

The page must state, at minimum: what is collected (analytics events, no account
needed), who processes it (OpenPanel, self-hosted at `analytics.zias.be`), that
consent is optional and withdrawable, where to withdraw it (the account page, Task 6),
and that a consent record is kept as evidence and outlives account deletion — which
is true, and is the behaviour `account.int.test.ts:1245` already proves.

Run: `bun -F site test src/app` and `bun -F site check-types`
Expected: exit 0.

- [ ] **Step 6: Mount it**

In `apps/site/src/app/(frontend)/[locale]/layout.tsx`, beside the existing leaf at
`:193`:

```tsx
        {user === null ? null : <GuestFavoritesSync />}
        <ConsentBanner locale={locale} />
```

`ConsentBanner` mounts for everyone, signed in or not — a signed-in visitor who has
never answered still has not answered. It sits inside `<SiteDocument>` and therefore
appears on every localized page and on nothing under `(payload)`: the route groups are
siblings, so the admin cannot inherit it.

Do **not** mount it in `kitchen-sink/layout.tsx`. That route is a second document root
with `robots: { index: false }`, and a design-system page that renders a live consent
prompt would write a real decision into the reviewer's browser.

- [ ] **Step 7: Prove the locale assertion can fail**

Mutation: in `COPY`, replace the `fr` object's five values with the `nl` object's.

Run: `bun -F site test src/components/ConsentBanner.test.tsx`
Expected: FAIL — "speaks each locale, distinctly", `expected 2 to be 3`. Restore byte
for byte, confirm `git diff` is empty and the suite is 7/7.

- [ ] **Step 8: Commit**

```bash
bun x biome check --write apps/site/src
git add apps/site/src/components/ConsentBanner.tsx apps/site/src/components/ConsentBanner.test.tsx "apps/site/src/app/(frontend)/[locale]/privacy/page.tsx" "apps/site/src/app/(frontend)/[locale]/layout.tsx"
git commit -m "feat(site): ask once, in the reader's language, and take no for an answer"
```

---

## Task 5: The relay, and the limiter it cannot ship without

The old relay is `apps/server/src/index.ts:418-454`, a Hono route behind
`rateLimit({ namespace: "analytics", limit: 120, windowSeconds: 60 })`. **That
limiter cannot be ported.** It is `apps/server/src/services/rateLimit.ts`, backed by a
module-level `ioredis` client on `REDIS_URL`; `apps/site` declares no Redis client, and
no Redis is reachable from a Cloudflare Worker in this repo's infrastructure. The full
binding inventory of `apps/site/wrangler.jsonc` is `ASSETS`, `D1`, `R2`, `EMAIL` — no
KV, no Durable Object, no Cloudflare Rate Limiting binding, no Analytics Engine.

So the limiter is rebuilt on D1. **Read `apps/site/src/lib/claims.ts` before writing a
line of it**: it already states, with measurements, that a `where` on an update is a
SELECT, that there are no transactions, and that a unique index is the one atomic
primitive. This task does not re-derive any of that.

**The relay must ship with the limiter in the same commit.** A public unauthenticated
write endpoint on an app with no rate limiting is the vulnerability; shipping the
endpoint first and the limiter next sprint is how it stays one.

**Files:**
- Create: `apps/site/src/collections/RateLimits.ts`
- Create: `apps/site/src/lib/rateLimit.ts`
- Create: `apps/site/src/lib/rateLimit.int.test.ts`
- Create: `apps/site/src/endpoints/analytics.ts`
- Create: `apps/site/src/endpoints/analytics.int.test.ts`
- Modify: `apps/site/src/payload.config.ts`
- Modify: `apps/site/wrangler.jsonc`
- Modify: `apps/site/src/jobs/index.ts`

**Interfaces:**
- Consumes: `guardOrigin` from `@/lib/formPost`; `readBody` (find its module before
  using it — the mobile JSON endpoints already import it); `requireBinding` from
  wherever `payload.config.ts` gets it.
- Produces:

```ts
export type RateLimitVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };
export async function takeRateLimit(args: {
  key: string;
  limit: number;
  namespace: string;
  payload: Payload;
  windowSeconds: number;
}): Promise<RateLimitVerdict>;
export const analyticsEndpoints: Endpoint[];
```

- [ ] **Step 1: Decide the counter, with a measurement — this is a gate, not a step**

Two designs are available on D1. Pick one, record which and why in the commit message,
and do not skip the measurement.

**(a) Count-then-insert.** `payload.count` over the window, then `payload.create` one
row. Uses only shipped primitives. **It is approximate**: two requests that both count
`limit - 1` before either inserts will both pass, so the overshoot is bounded by
in-flight concurrency rather than by the limit.

**(b) Upsert-and-return.** One statement — `INSERT … ON CONFLICT(key) DO UPDATE SET
count = count + 1 RETURNING count` — which SQLite evaluates atomically, making the
count exact. It needs raw drizzle. **Verify `payload.db.drizzle` is actually reachable
on this adapter before choosing it**, and verify the atomicity rather than assuming it:

Run: `bun -F site test src/lib/rateLimit.int.test.ts -t "holds under concurrency"` after writing the
concurrency test in Step 3, and drive 20 parallel calls at a limit of 10. Design (b)
must yield exactly 10 allowed. Design (a) will yield more, and the test must then
assert the bound it actually offers rather than a number it cannot honour.

If (b) is reachable, take it: exact beats approximate, and the spec's own rule — a
unique index evaluated inside the INSERT is the atomic primitive — is what makes it
work. If it is not reachable, take (a) and **write the overshoot into the module's doc
comment**, because an undocumented approximate limiter reads like an exact one.

- [ ] **Step 2: The collection**

Create `apps/site/src/collections/RateLimits.ts`. Every one of the four access rules
is stated: Payload's `defaultAccess` is `Boolean(user)`, so an omitted rule is an open
rule, and this table records IP-derived keys.

```ts
import type { CollectionConfig } from "payload";
import { denyAll } from "@/access";

/**
 * One row per (namespace, client, window). The unique index is the mechanism.
 *
 * Not reachable over the API at all — not even by an admin, and not for
 * reading. The `key` column is derived from a client address, so the table is
 * personal data with a retention period measured in minutes; `jobs/` prunes it.
 * Writes go through `lib/rateLimit.ts` on the local API.
 */
export const RateLimits: CollectionConfig = {
  slug: "rate-limits",
  access: {
    create: denyAll,
    delete: denyAll,
    read: denyAll,
    update: denyAll,
  },
  fields: [
    // `${namespace}:${clientKey}:${windowStart}` — namespaced for the same
    // reason `claims.key` is (see `lib/claims.ts`): two features must not be
    // able to collide in one keyspace.
    { name: "key", type: "text", required: true, unique: true, index: true },
    { name: "count", type: "number", required: true },
    // Epoch seconds. Indexed because the pruning job filters on it.
    { name: "windowStart", type: "number", required: true, index: true },
  ],
};
```

Register it in `payload.config.ts` beside the other collections, then generate the
migration with the repo's own tooling rather than hand-writing SQL:

Run: `bun -F site payload migrate:create` (confirm the exact script name in
`apps/site/package.json` first) and then `bun -F site test src/collections`
Expected: a new migration file, and the payload-types drift check clean.

- [ ] **Step 3: Write the failing limiter test**

Create `apps/site/src/lib/rateLimit.int.test.ts` following the standard `*.int.test.ts`
scaffolding in this app — `getPayload({ config })` in `beforeAll`, a `RUN` uuid, and an
`afterAll` that deletes what the file created.

```ts
import { getPayload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";
import { takeRateLimit } from "./rateLimit";

describe("the rate limiter, against a real database", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  const RUN = crypto.randomUUID();

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  afterAll(async () => {
    await payload.delete({
      collection: "rate-limits",
      where: { key: { like: RUN } },
    });
  });

  const take = (key: string, limit = 3) =>
    takeRateLimit({
      key,
      limit,
      namespace: `test-${RUN}`,
      payload,
      windowSeconds: 60,
    });

  it("allows up to the limit and refuses the next one", async () => {
    const key = `serial-${crypto.randomUUID()}`;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const verdict = await take(key);
      expect(`${attempt}:${verdict.allowed}`).toBe(`${attempt}:true`);
    }

    const refused = await take(key);
    expect(refused.allowed).toBe(false);
    if (refused.allowed === false) {
      expect(refused.retryAfterSeconds).toBeGreaterThan(0);
      expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it("counts each client separately", async () => {
    const mine = `mine-${crypto.randomUUID()}`;
    const theirs = `theirs-${crypto.randomUUID()}`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await take(mine);
    }

    expect((await take(mine)).allowed).toBe(false);
    expect((await take(theirs)).allowed).toBe(true);
  });

  /*
   * The whole reason this module could not be ported. The Redis original used
   * INCR, which is atomic in the store; D1 has no transactions, so whatever
   * replaces it has to be atomic in the INSERT or honest about not being.
   *
   * Assert the design chosen in Step 1. Under (b) the number is exactly 10.
   * Under (a) it is not, and this test asserts the documented bound instead —
   * with the real number printed, so the overshoot is a measurement and not a
   * shrug.
   */
  it("holds under concurrency", async () => {
    const key = `concurrent-${crypto.randomUUID()}`;

    const verdicts = await Promise.all(
      Array.from({ length: 20 }, () => take(key, 10))
    );
    const allowed = verdicts.filter((verdict) => verdict.allowed).length;

    expect(allowed).toBe(10);
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `bun -F site test src/lib/rateLimit.int.test.ts`
Expected: FAIL — cannot resolve `./rateLimit`.

If it instead fails with `too many SQL variables`, that is the persisted-D1 row
accumulation this project has hit before: `rm -rf apps/site/.wrangler/state/vitest` and
re-run. That is environmental, not your change.

- [ ] **Step 5: Write the limiter, then the relay**

`apps/site/src/lib/rateLimit.ts` implements the design chosen in Step 1. Its doc
comment must state: which design it is, that the Redis original is at
`apps/server/src/services/rateLimit.ts` and why it could not come across, and — if
design (a) — the exact overshoot bound.

**Carry the fail-open contract across deliberately.** The original's comment is
`rateLimit.ts:58-59`: *"Availability wins if Redis is temporarily unavailable; the
upstream provider limits remain a secondary safety net."* Decide explicitly whether that
still holds when the store is the app's own database rather than a separate service —
a D1 outage means the site is down anyway — and write down the decision either way.

`apps/site/src/endpoints/analytics.ts` is the relay. Port these properties from
`apps/server/src/index.ts:414-454` and `:159-200`, each of which is load-bearing:

- **The event allowlist.** `ANALYTICS_TRACK_EVENTS` (`index.ts:132-138`) is five names:
  `gesture_collection_changed`, `gesture_viewed`, `screen_view`, `search_performed`,
  `video_playback_completed`. Note it is a hand-maintained second copy of the
  vocabulary and **`screen_view` is not in `AnalyticsEventMap` at all** — the type has
  four members (`packages/shared/src/analytics.ts:1-22`). Derive the allowlist from the
  type and add `screen_view` explicitly with a comment, so the two cannot drift again.
- **The client secret never reaches the browser.** That is the entire reason the relay
  exists. `openpanel-client-id` and `openpanel-client-secret` are set server-side
  (`index.ts:170-171`).
- **`x-client-ip` and `user-agent` are forwarded** (`index.ts:175-182`) so OpenPanel
  geolocates the visitor rather than the Worker. `getClientIp` (`index.ts:148-157`)
  prefers `cf-connecting-ip`, then `true-client-ip`, then the first hop of
  `x-forwarded-for`, then `x-real-ip`. On Cloudflare, `cf-connecting-ip` is set by the
  edge and is the one to trust; **the rest are client-supplied and must not be used to
  key the rate limiter**, or the limit is bypassed by a header.
- **Missing credentials is a silent no-op** (`index.ts:163-166`), and the handler
  answers `202` regardless. Keep that: a site whose analytics vendor is unconfigured
  must still serve pages.
- **No session is required, and that is deliberate** (the original has no auth check
  either). A guest who granted consent is trackable, and their gate is client-side
  because there is no row to look up for someone with no account. When the request
  *does* carry a session, check the account's most recent `user-consents` row and
  refuse on `analyticsConsent: false` — that costs one indexed read and closes the
  case where a signed-in visitor's browser state disagrees with what they told the
  server. Do not write a comment claiming the relay verifies consent: for guests it
  verifies origin, vocabulary and rate, and nothing more.

- [ ] **Step 6: Write the relay's tests — Review Focus 3**

In `apps/site/src/endpoints/analytics.int.test.ts`, at minimum:

```ts
  it("refuses an event that is not in the allowlist", async () => {
    const response = await post("/analytics/track", {
      payload: { name: "password_entered", properties: {} },
      type: "track",
    });

    expect(response.status).toBe(400);
  });

  it("refuses a cross-site post", async () => {
    const response = await post(
      "/analytics/track",
      { payload: { name: "gesture_viewed", properties: {} }, type: "track" },
      { origin: "https://evil.example" }
    );

    expect(response.status).toBe(403);
  });

  it("stops forwarding once the limit is spent", async () => {
    // The limiter is keyed on the edge-supplied address, so the test drives it
    // through the same header the Worker will see.
    const ip = `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
    const send = () =>
      post(
        "/analytics/track",
        { payload: { name: "gesture_viewed", properties: {} }, type: "track" },
        { ip }
      );

    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      expect((await send()).status).toBe(202);
    }

    const refused = await send();
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).not.toBeNull();
  });

  it("does not let a client-supplied header buy a fresh budget", async () => {
    /*
     * The bypass this guards: `x-forwarded-for` is attacker-controlled, and a
     * limiter that keys on it counts every request as a new client. On
     * Cloudflare, `cf-connecting-ip` is set by the edge and is the only one of
     * the four that is not.
     */
    const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`;
    const send = (spoofed?: string) =>
      post(
        "/analytics/track",
        { payload: { name: "gesture_viewed", properties: {} }, type: "track" },
        { forwardedFor: spoofed, ip }
      );

    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      await send();
    }

    expect((await send("10.0.0.1")).status).toBe(429);
  });
```

- [ ] **Step 7: Add the pruning job**

`rate-limits` rows are personal data with a lifetime of one window. Stage 7 shipped the
job infrastructure; add a prune to it rather than inventing a second mechanism. Read
`apps/site/src/jobs/index.ts` and the existing `cleanupStalePayments` job and follow
their shape, including how they are tested.

- [ ] **Step 8: Add the environment**

`apps/site/wrangler.jsonc` has no `vars` block at all today. The file's own opening
comment records the deliberate rule that bindings live only inside the named
environments, never at top level — follow it. Add `OPENPANEL_API_URL` as a var per
environment and take the client id and secret as **secrets** (`wrangler secret put`),
never as vars, and never into the repo.

Document in `.env.example` that `apps/site` now reads `OPENPANEL_API_URL`,
`OPENPANEL_CLIENT_ID` and `OPENPANEL_CLIENT_SECRET`. Note the existing block at
`.env.example:69-82` already declares these for the old server; say plainly which app
reads which, because the two will run side by side until Stage 10.

- [ ] **Step 9: Run everything and commit**

```bash
bun -F site test src/lib/rateLimit.int.test.ts src/endpoints/analytics.int.test.ts
bun -F site check-types
bunx knip --no-progress --no-config-hints
git add apps/site packages .env.example
git commit -m "feat(site): relay analytics, behind a limiter D1 can actually enforce"
```

---

## Task 6: The row, and the account that can change its mind

The first production writer `user-consents` has ever had. Its shape is fixed by a
decision recorded before the plan was written: **a guest's choice stays in the browser,
and a row is written when there is an account to attach it to.** That keeps an
unauthenticated write endpoint off the app, which matters more here than anywhere —
`user-consents` is append-only by design, so a public writer is a public way to fill a
legal-evidence table with rows nobody can delete.

**Files:**
- Create: `apps/site/src/endpoints/consent.ts`
- Create: `apps/site/src/endpoints/consent.int.test.ts`
- Create: `apps/site/src/components/ConsentSync.tsx`
- Modify: `apps/site/src/app/(frontend)/[locale]/layout.tsx`
- Modify: `apps/site/src/app/(frontend)/[locale]/account/page.tsx`

**Interfaces:**
- Consumes: `readConsent` from `@/lib/consentStore`; `guardOrigin`; the session helpers
  in `@/lib/session`.
- Produces:

```ts
export const CONSENT_VERSION = "2026-09-22";
export async function recordConsent(args: {
  analyticsConsent: boolean;
  ipAddress?: string;
  req: PayloadRequest;
  userAgent?: string;
  userId: number | string;
}): Promise<void>;
export const consentEndpoints: Endpoint[];
```

- [ ] **Step 1: Read the one shipped precedent before writing the writer**

Run: `sed -n '1,90p' apps/site/src/hooks/logSponsorshipTransitions.ts`

That is the only code in this app that writes an append-only collection. The mechanism
is `req.payload.create({ collection, data, overrideAccess: true, req })` — the local
API with an explicit override, `req` threaded through. Its doc comment explains why the
flag is not a convenience. Copy the mechanism; do not invent a second one.

Note one difference that matters: a `payload.create` called **without** a `req`
already defaults `overrideAccess` to `true`, which is why the existing
`UserConsents.int.test.ts` fixtures write with no flag. Pass both `req` and the
explicit flag, as the hook does, so the call says what it is doing.

- [ ] **Step 2: Write the failing test — Review Focus 2**

`apps/site/src/endpoints/consent.int.test.ts`:

```ts
  it("records a refusal as a row, not as an absence", async () => {
    /*
     * Review Focus 2, and the reason this stage exists. The column is
     * `integer DEFAULT false NOT NULL`, so "no row" and "a row saying no" are
     * indistinguishable in SQL — and Stage 9 imports into this table. A
     * reconciler that only writes on `true` therefore records nothing for
     * everyone who declined, and the import cannot tell them from the people
     * who were never asked.
     */
    const member = await createMember("declined");

    const response = await post(
      "/consent",
      { analyticsConsent: false },
      { token: member.token }
    );

    expect(response.status).toBe(200);

    const rows = await payload.find({
      collection: "user-consents",
      overrideAccess: true,
      where: { user: { equals: member.id } },
    });

    expect(rows.totalDocs).toBe(1);
    expect(rows.docs[0]?.analyticsConsent).toBe(false);
    expect(rows.docs[0]?.consentVersion).toBe(CONSENT_VERSION);
  });

  it("appends rather than amends when somebody changes their mind", async () => {
    // The collection denies `update` to everyone. A second decision is a
    // second row, and the history is the evidence.
    const member = await createMember("changed-mind");

    await post("/consent", { analyticsConsent: true }, { token: member.token });
    await post("/consent", { analyticsConsent: false }, { token: member.token });

    const rows = await payload.find({
      collection: "user-consents",
      overrideAccess: true,
      sort: "createdAt",
      where: { user: { equals: member.id } },
    });

    expect(rows.totalDocs).toBe(2);
    expect(rows.docs.map((row) => row.analyticsConsent)).toEqual([true, false]);
  });

  it("refuses a caller with no session", async () => {
    const response = await post("/consent", { analyticsConsent: true });

    expect(response.status).toBe(401);
  });

  it("refuses a cross-site post", async () => {
    const response = await post(
      "/consent",
      { analyticsConsent: true },
      { origin: "https://evil.example" }
    );

    expect(response.status).toBe(403);
  });

  it("records the account from the session, never one the body names", async () => {
    // The same guard Stage 8 added to the mobile account endpoints, for the
    // same reason: the body must not be able to name a victim.
    const owner = await createMember("consent-owner");
    const stranger = await createMember("consent-stranger");

    await post(
      "/consent",
      { analyticsConsent: true, user: owner.id, userId: owner.id },
      { token: stranger.token }
    );

    const ownerRows = await payload.find({
      collection: "user-consents",
      overrideAccess: true,
      where: { user: { equals: owner.id } },
    });

    expect(ownerRows.totalDocs).toBe(0);
  });
```

- [ ] **Step 3: Implement, run, and mutate**

After the tests pass, prove the Review Focus 2 assertion can fail. Mutation: in the
handler, wrap the `recordConsent` call in `if (analyticsConsent) { … }`.

Run: `bun -F site test src/endpoints/consent.int.test.ts`
Expected: FAIL — "records a refusal as a row, not as an absence". Restore byte for byte
and confirm the suite is green again.

- [ ] **Step 4: The reconciler**

`apps/site/src/components/ConsentSync.tsx` mirrors `GuestFavoritesSync` exactly: a
`"use client"` leaf that returns `null` and runs one effect. Mount it in the layout
beside the existing one, **only when there is a session** — the same
`{user === null ? null : …}` condition, for the same reason.

Read `apps/site/src/lib/mergeGuestState.ts` first. Its two rules govern this too, and
its doc comment states both: **idempotence**, because re-running on every signed-in
page load is the normal case and not the exception; and **the irreversible step last**,
because there are no transactions and a partial failure must be retryable. Here that
means: POST first, and only clear or mark the local flag after the server has
acknowledged.

Decide and document what "already reconciled" means. Posting a duplicate row on every
page load would turn the evidence table into a log of page views; the honest options
are a local marker or a server-side check for an existing row at this
`CONSENT_VERSION`. Pick one, and write a test that loading two signed-in pages produces
exactly one row.

- [ ] **Step 5: The re-toggle**

Consent that cannot be withdrawn is not consent, and the privacy page written in Task 4
promises this control exists. Add it to
`apps/site/src/app/(frontend)/[locale]/account/page.tsx`, using `Switch` from
`@smog/ui-web` (size `sm | md | lg`, no `variant`; it renders `role="switch"` with
`aria-checked`). Changing it writes the store and posts a new row — the same two calls
the banner makes.

The old stack's equivalent is `apps/web/src/components/analytics-consent-control.tsx`;
read it for the copy, not for the mechanism.

- [ ] **Step 6: Commit**

```bash
bun -F site test src/endpoints/consent.int.test.ts src/components
bun -F site check-types && bunx knip --no-progress --no-config-hints
git add apps/site/src
git commit -m "feat(site): the first row user-consents has ever been given"
```

---

## Task 7: Emit the events, and only the ones that exist

**Files:**
- Create: `apps/site/src/lib/analytics.ts`, `apps/site/src/lib/analytics.test.ts`
- Modify: the call sites named below

**The vocabulary is four typed events plus one untyped string**, and this is where a
port silently invents things. From `packages/shared/src/analytics.ts`:
`gesture_collection_changed`, `gesture_viewed`, `search_performed`,
`video_playback_completed` — and `screen_view`, which exists only as a literal in three
files and has a different property shape per platform.

Of those, on this site's routes: `gesture_viewed` has a surface (`gestures/[id]`),
`gesture_collection_changed` has both its `collection` values, `search_performed` has
the search route. **`video_playback_completed` has never had a web emitter at all** —
it fires only from `apps/native/screens/GestureScreen.tsx:70`. Do not invent one to
make the set look complete; note it in the exit as native-only.

**The sponsorship funnel, auth, and shared-list views have no event names in the
vocabulary.** Do not add any in this stage. A new event is a new thing collected about
a person, and it belongs in a stage where that is the subject under review rather than
a detail of a port.

- [ ] **Step 1: The client module**

`apps/site/src/lib/analytics.ts` is the browser half. The gate is the whole point, and
it is one line in the original (`apps/web/src/lib/openpanel.ts:37`):

```ts
if (getAnalyticsConsent() !== true) {
  return;
}
```

**Carry the property, not the identifier.** `getAnalyticsConsent` is `apps/web`'s API
and does not exist on this stack; Task 2 ships `readConsent(): ConsentState`. The
property worth reproducing is that the check is positive rather than falsy — undecided
and denied must BOTH drop the payload, which `if (!consent)` would also do today and
would stop doing the moment a fourth state appears. So:

```ts
if (readConsent() !== "granted") {
  return;
}
```

Read from `@/lib/consentStore`, never from a second copy of the state.
Its test asserts that an undecided visitor and a refusing visitor both send nothing —
with `fetch` spied, so the assertion is about the network and not about a return value.

- [ ] **Step 2: Wire the three emitters**

`gesture_viewed` on the detail route, `search_performed` on search, and
`gesture_collection_changed` where favourites and lists change. The existing call sites
in `apps/web` (`routes/gestures_.$id.tsx:70`, `routes/gestures.tsx:81`,
`lib/lists-context.tsx:180,233,294`) show which properties each carries; keep the
property names identical so the two stacks' data is comparable while both are live.

- [ ] **Step 3: Commit**

```bash
bun -F site test src/lib/analytics.test.ts && bun -F site check-types
git add apps/site/src
git commit -m "feat(site): emit the four events that exist, and no others"
```

---

## Task 8: Exit

- [ ] **Step 1: Check every criterion with a measurement**

1. **A visitor who never answers is never tracked.** The `!== true` gate, asserted.
2. **A refusal is a row.** `consent.int.test.ts` green, and its mutation fails.
3. **The banner does not trap focus.** `Banner.test.tsx` green, and its mutation fails.
4. **The relay refuses what the allowlist does not name**, and refuses a cross-site post.
5. **The limiter holds**, with the concurrency number from Task 5 Step 1 recorded, and
   the design chosen (exact or approximate) named explicitly.
6. **No client secret is in the browser bundle.** Measure it:
   `bun -F site build:app && grep -rc "OPENPANEL_CLIENT_SECRET" apps/site/.open-next/assets || echo "absent"`.
   Then delete `.open-next/` — leaving it makes `site#check-types` fail with four
   `TS1111` errors from the generated `handler.mjs`, a local-only trap Stage 8 hit.
7. **`bun release:check` passes**, `expo-doctor`'s two sandbox failures excepted and
   confirmed against CI.
8. **`bunx knip --no-progress --no-config-hints` is clean.**
9. **The site bundle has not grown materially.** Stage 8 measured HEAD at 7,564.67 KiB
   gzipped against a 10.00 MiB budget. Re-measure by building base and HEAD with the
   same `node_modules`, as Stage 8's exit did, rather than comparing against a number
   from another build environment.
10. **`user-consents` has rows written by production code**, not only by fixtures — the
    thing that was not true when this stage began.

- [ ] **Step 2: Run the whole-stage mutation**

Set `unique: false` on `rate-limits.key` and run `bun -F site test`. The limiter's
concurrency test must fail. Restore byte for byte and confirm the count returns. If the
concurrency test passes with the constraint gone, the limiter is not standing on the
unique index and design (b) was not achieved — say so rather than exiting.

- [ ] **Step 3: Write the exit assessment**

Append it here in the shape Stages 4–8 use. Carry forward at minimum:

- **Whether the CI split worked.** Task 1 made a falsifiable prediction. Record what
  happened: if the desync recurred in `site-tests`, the load hypothesis is dead and the
  `isolate` experiment is next; if it did not recur, say how many runs that is over,
  because absence over three runs is not proof.
- **`video_playback_completed` has no web emitter**, by choice.
- **The sponsorship funnel, auth and shared lists emit nothing.**
- **The two stacks use different consent storage keys** — `smog_analytics_consent`
  (web), `@smog_analytics_consent` (native), `smog.consent.analytics` (site) — and
  Stage 9 must decide what, if anything, migrates.
- **`apps/mobile` has no analytics at all.** Confirmed: no dependency, no module, no
  prompt. Whether the new native app gets consent and tracking is Stage 10's to decide,
  and it is a real gap — the old native app had both.
- **Stage 9 is now unblocked**, and what it must do with `analytics_consent`: set it
  explicitly for every row, and assert the resulting distribution against the source
  rather than trusting the insert.
- **Blocked on the user:** the Cloudflare token still needs rotating; OpenPanel client
  id and secret for the site; and a decision on whether `analytics.zias.be` serves the
  new site's origin under CORS.

- [ ] **Step 4: Update the spec and the plans README**

Mark Stage 8.5 landed, link this plan, and add to the spec's findings:

- that the spec's own claim about Stage 4's consent test was wrong — the test creates a
  fixture row and reads it back (`account.int.test.ts:1181-1203`), so the property it
  proves is real;
- that Redis-backed anything cannot cross to the Worker, and what replaced it;
- whichever of the limiter designs was achievable, with its measurement.

- [ ] **Step 5: Commit and push**

```bash
bun run release:check
git add docs apps packages
git commit -m "docs: close Stage 8.5 with the measurements"
git push -u origin claude/exciting-cerf-y8jun7
```
