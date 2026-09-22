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

---

## Stage 8.5 exit criteria

1. A visitor who never answers is never tracked.
2. A refusal is a row.
3. The banner does not trap focus.
4. The relay refuses what the allowlist does not name, and refuses a cross-site post.
5. The limiter holds, with the concurrency number recorded and the design named.
6. No client secret is in the browser bundle.
7. `bun release:check` passes.
8. `bunx knip --no-progress --no-config-hints` is clean.
9. The site bundle has not grown materially.
10. `user-consents` has rows written by production code, not only by fixtures.

## Stage 8.5 exit: measured

Measured on `74a3d1d`, the branch head after Task 5's fix round 2 landed.

### The headline: the limiter gate, and what it caught

**20 parallel calls at a limit of 10:**

| design | allowed of 20 |
|---|---|
| **(b) upsert-and-return, shipped** | **10** |
| (a) count-then-insert, the plan's fallback | 20 |
| (b) with the unique index removed | 0 |

Design (a) is not an approximate limiter. At a limit of 10 it let **every one
of the twenty through** — it is no limiter at all for exactly the traffic
shape a limiter exists for. **Had the plan simply specified the simpler
option, this stage would have shipped something shaped like a rate limiter
that enforced nothing, with every functional test green**, because every
functional test issues requests one at a time and (a) passes all of them. The
gate — "measure both, then choose" — is the only reason the difference was
ever seen.

The third number is the mechanism, re-measured at this exit rather than
quoted: with `unique: false` on `rate-limits.key`, `holds under concurrency`
fails `expected +0 to be 10`. SQLite rejects an `ON CONFLICT` target matching
no constraint, the statement throws, and the deliberately fail-closed path
refuses everything. A lost index is loud in both directions.

**Fail-open was deliberately reversed to fail-closed.** The Redis original
(`apps/server/src/services/rateLimit.ts`) swallows store failures because
Redis is a separate service. Here the store is the application's own D1:
there is no state of the world where the site serves and D1 is unreachable,
so "availability wins" buys nothing, while failing open would turn any
provokable fault into an unlimited public write endpoint.

### The whole-stage mutation

`unique: false` on `rate-limits.key`, `.wrangler/state/vitest` cleared so the
index was really gone, full `bun -F site test`:

**13 tests fail across 2 files** (1,597 passed of 1,610):

| file | failures | of |
|---|---|---|
| `src/lib/rateLimit.int.test.ts` | 4 | 6 — `allows up to the limit and refuses the next one`, `counts each client separately`, `counts each namespace separately`, `holds under concurrency` |
| `src/endpoints/analytics.int.test.ts` | 9 | 11 — every test that expects the relay to answer anything other than 429 |

The two survivors in each file are the ones that do not need the index: the
prune tests (`drains a backlog larger than D1's bind-parameter cap`, `keeps
the live window and takes the spent ones`), and the two relay tests whose
expected answer is a refusal anyway (`refuses a cross-site post`, which
`guardOrigin` answers before the limiter runs, and `does not let a
client-supplied header buy a fresh budget`).

Restored byte for byte: md5 `9a93f7a4f45037b8f6487adbe07e62a3` before and
after, `git diff` empty, and the full suite back to **1,610 / 1,610 in 124
files**.

### Whether the CI split worked

Task 1 stated a falsifiable prediction: if miniflare's sync-proxy desync
(`assert (message?.id === id)`, `fetch-sync.ts:147`) recurs in a job running
nothing but the site suite, contention with the rest of `release:check` was
not the cause.

`site-tests` has been dispatched **17 times** since the split first ran on
`b32f64b`. Three were cancelled by `cancel-in-progress` before completing and
assert nothing. Of the **14 that completed, 13 were green and one was red**:

- **12 consecutive green** — runs 119, 121–125, 127–132 (`37594c6` through
  `f50d736`).
- **Run 133 on `17b3aba` failed**, and **it was not the desync.** One
  assertion, `refuses nothing on the strength of a missing Origin`, `expected
  429 to be 202`, with 1,609 of 1,610 passing. Cause found and fixed in
  `74a3d1d`; see "A randomised fixture is not an isolated one" below.
- **Run 134 on `74a3d1d` is green**, all five jobs.

**So: 14 completed runs of the isolated job, zero recurrences of the desync.**
That is what the record says, and it is not a verdict. The desync recurred at
intervals of hours across the Stage 8 branch, and this branch's whole life is
about nine hours. Fourteen runs is evidence, not proof; the `isolate`
experiment stays on the shelf rather than being discarded.

**Wall clock.** Before the split, `release-check` carried the site suite:
**8m16s** on `1cd69bf`, 8m51s on `8370e74`, 8m50s on `38a186d`. After it,
across the 12 completed post-split runs, `release-check` ranges 3m47s–6m05s
(median ≈5m01s) and `site-tests` 2m44s–5m56s; both jobs start in the same
second and run in parallel. On `74a3d1d` the pair is release-check 3m59s and
site-tests 4m06s.

**But the workflow's wall clock did not halve, and saying it did would be
wrong.** `site-e2e` was 5m50s on `1cd69bf` and is 7m00s on `74a3d1d` — this
stage added a consent-banner spec and consent seeding to four others — so the
critical path moved from `release-check` (8m16s) to `site-e2e` (7m00s). The
job that was the bottleneck roughly halved; the workflow got about a minute
faster. Load reduction was the goal and wall clock was never it.

### The prediction failed, and the desync had an upstream cause

**The desync recurred in `site-tests`** on `8286152` (job 106867445368), a
docs-only commit: `src/seed/seed.int.test.ts`, `assert (message?.id === id)`,
1,620 of 1,634 passing. That is the outcome Task 1 said would kill the load
hypothesis, and it did — contention with the rest of `release:check` was not
the cause, or not the whole of it.

**The shelved `isolate: true` experiment was run, and rejected.** Measured
locally on the same tree, one run each: `isolate: false` 269 s,
`isolate: true` 502 s (+87%; import time 12% → 23%, because every
integration file re-imports Payload). Scoping isolation to the files that
reach the proxy saves little, since those are 58 of the 126 files and carry
most of the cost. Both runs were green, so the experiment could not show the
setting prevents the desync — only what it costs.

**Reading miniflare's `SynchronousFetcher` showed why it would not have
prevented it.** The race is inside a single fetcher, not between files. The
host resets a shared `Int32Array` flag to 0, posts request K+1 and
`Atomics.wait`s; the worker posts its reply, *then* stores 1 and notifies. A
worker preempted between request K's store and its notify wakes the host
during K+1, `receiveMessageOnPort` returns nothing, the assertion fires, and
the port queue stays offset by one for the rest of that instance's life —
which is why one occurrence took down every later query in the file. Load
makes preemption likelier, which is why it tracked CI load without being
caused by the other jobs.

Upstream fixed exactly this in
[cloudflare/workers-sdk#15552](https://github.com/cloudflare/workers-sdk/pull/15552)
(merged 2026-09-16): the flag becomes a per-request generation (`id + 1`),
and the host loops until it sees its own. The fix first ships in miniflare
`5.20260917.0-alpha`, which wrangler **4.134.0** is the first to depend on —
verified by unpacking the published tarballs, not from the changelog.

**So `wrangler` goes from `~4.116.0` to `~4.136.3`.** The old pin came in
with the scaffold template (`ab16300`); nothing chose it. It was also
already outside the installed `@opennextjs/cloudflare@1.20.6`'s declared
peer range (`wrangler ^4.125.0`). On the new version: site suite green,
1,634 of 1,634, in 179 s (vs 269 s); site e2e 118 of 118; lint, typecheck,
the non-site suites, `bun audit`, `bun run build` and knip green; Payload
types, admin import map and `cloudflare-env.d.ts` regenerate with no diff.
`expo-doctor` failed locally on its two network checks (the sandbox proxy
answers Expo's hosts with "Host not in allowlist") — the environment, as
AGENTS.md warns, and in `apps/native`, which this change does not touch. The
bundle-size job needs Cloudflare credentials and is left to CI.

**What would falsify this:** a recurrence of `message?.id === id` on a
commit carrying wrangler ≥ 4.134.0. The fixed code no longer contains that
assertion in the fetch path — it lives in `receiveReply`, after the
generation loop — so a recurrence would point at a different bug, not at
this one surviving.

### A randomised fixture is not an isolated one

Run 133's failure is the most instructive thing this stage produced after the
limiter gate, and the diagnosis that first looked right was wrong.

The first hypothesis was that tests omitting `cf-connecting-ip` fall into
`rateLimitKey`'s shared `"unknown"` bucket and spend one budget between them.
They do not: every test in that file already passed an address. **The defect
was one line up, in a helper whose doc comment promised precisely the property
its code failed to deliver:**

```ts
/** A fresh `cf-connecting-ip` per test, so no two tests share a budget. */
return `${block}.${Math.floor(Math.random() * IP_MAX) + 1}`;
```

An address *is* a budget. Ten tests drawn at random from 254 addresses is a
birthday collision at a few percent per run, and two of those tests spend a
120-request budget down to its last request on purpose. That is "green ten
times, red on the eleventh" exactly.

The fix is deliberately both halves: `freshClientIp()` allocates from a
counter and **throws** if the block runs out rather than wrapping onto a spent
address — a counter cannot collide — and a `beforeEach` clears the namespace,
which is the half that survives the next person, because unique addresses hold
only while every future test remembers to ask for one, and a test that forgets
falls into the shared `"unknown"` bucket and silently reacquires the
dependency. The clear also covers what addresses cannot: `.wrangler/state/vitest`
is persisted, so a run that died before its cleanup leaves spent rows behind.

**The order-independence demonstration is the strongest evidence in the
stage.** The same mutation that failed six of eleven tests before the fix —
every test pinned to one shared address — now passes **11/11**, so no test's
result depends on the addresses being unique at all; the `beforeEach` carries
the property rather than luck. Plus three shuffled orders
(`--sequence.shuffle.tests`, seeds 11, 4242, 90210) at 11/11, with seed 11
running the CI-failing test first and seed 90210 running it immediately after
the budget-exhausting one.

**And this is the third time in this stage a comment asserted a property its
code did not hold.** Task 3's `[data-radix-portal]` query could not fail for
two independent reasons while its comment said it detected "the one thing
`Sheet` would have added". Task 6's pinning test's doc comment claimed the
plausible refactor "fails that test by name"; it did not — the refactor passed
all 100 component tests. Now this. **Every one was found by somebody trying to
make the thing fail, and none by reading it.** That is the lesson Stages 9 and
10 should carry, above any individual fix here: in this codebase a comment
about a test's power is a claim of the same standing as a claim about a
library, and it has the same track record.

### Each criterion, and what it was verified against

| # | criterion | met | measurement |
|---|---|---|---|
| 1 | a visitor who never answers is never tracked | **yes** | `src/lib/analytics.test.ts` 5/5. Gate mutated `readConsent() === "granted"` → `readConsent() !== "denied"` (the falsy-style check the module warns against): **`sends nothing for a visitor who has not answered yet` fails**, "expected fetch to not be called at all, but actually been called 1 times". 1 failed / 4 passed; restored, md5 `9b735971bc22dc9bdcb8f3e9d5b27c84`. |
| 2 | a refusal is a row | **yes** | `src/endpoints/consent.int.test.ts` 8/8, driving the real `POST /api/consent` through `handleEndpoints` with the shipped config. Mutated the handler to write only when `analyticsConsent` is true — the exact reconciler defect the spec's Stage 9 hazard names: **2 fail**, `records a refusal as a row, not as an absence` (`expected +0 to be 1`) and `appends rather than amends when somebody changes their mind` (`expected 1 to be 2`). Restored, md5 `71d4d8cc9c39529f2e8a7b7daeeefc38`. |
| 3 | the banner does not trap focus | **yes** | `packages/ui-web/src/components/Banner.test.tsx` 6/6, and **two** mutations each fail exactly one test: `createPortal(…, document.body)` fails `renders no scrim, and is not portaled out of the page`; focusing the first button on mount fails `does not take focus on mount, and does not trap it`. Restored, md5 `e0c61255175af9767bbed5a0083cdf0e`. |
| 4 | the relay refuses what the allowlist does not name, and refuses a cross-site post | **yes** | `src/endpoints/analytics.int.test.ts` 11/11. Allowlist mutated away (`Object.hasOwn(TRACK_EVENTS, name)` dropped): **`refuses an event that is not in the allowlist` fails, alone**. `guardOrigin`'s early return disabled: **`refuses a cross-site post` fails, alone**. Restored, md5 `fe34e2112b59ca9c0349c6686d3316df`. |
| 5 | the limiter holds, design named | **yes — design (b), upsert-and-return, exact** | `bun -F site test src/lib/rateLimit.int.test.ts -t "holds under concurrency"` → 1 passed, 5 skipped. 10 of 20 allowed at a limit of 10; table above. |
| 6 | no client secret in the browser bundle | **yes** | `CLOUDFLARE_ENV=staging bun run build:app`, then greps over the built output: `OPENPANEL_CLIENT_SECRET` appears **4 times across 3 files under `.open-next/server-functions/`** and **0 times anywhere under `.open-next/assets/`**. Positive control, so the grep is known to reach the browser bundle: `smog.consent.analytics` **is** present in `.open-next/assets/_next/static/chunks/`. `.open-next/` deleted afterwards. |
| 7 | `bun release:check` passes | **no on the first run, yes on the second — both reported** | See below. |
| 8 | knip clean | **yes** | `bunx knip --no-progress --no-config-hints` → exit 0, no output, twice (9.2s). |
| 9 | the bundle has not grown materially | **yes** | Base `38a186d` **7,564.66 KiB gzipped** (35,160.45 KiB raw) vs HEAD **7,574.53 KiB** (35,220.94 KiB raw): **+9.87 KiB gzipped**, 26% headroom against the 10.00 MiB budget. Built in a worktree with the same `node_modules` by hard link, as Stage 8's exit did. The base figure reproduces Stage 8's recorded 7,564.67 KiB to 0.01 KiB, which is the cross-check that the two builds are comparable. |
| 10 | `user-consents` has rows written by production code | **yes** | At `38a186d` the only non-test references to the collection were its own config, the access note and generated types — **no writer existed**. Now: browser `postConsent` (`components/ConsentSync.tsx:163`) → `POST /api/consent` → `endpoints/consent.ts:125` → `recordConsent` → `payload.create({ collection: "user-consents" })`, exercised end to end over HTTP by all 8 tests in `consent.int.test.ts`. |

### Criterion 7, honestly

**The first `bun release:check` of this exit failed, and not on `expo-doctor`.**
It failed in `site-tests` territory — the `analytics.int.test.ts` birthday
collision above, which CI hit on run 133 for `17b3aba`. That failure is
reported here rather than replaced by the later green run, because a stage
that only prints its second attempt is doing the thing this ledger spent
fifteen rulings refusing.

The second run, on `74a3d1d` with the fix in, reaches `native:release-check`
and stops there on `expo-doctor`'s **two documented sandbox failures**:

```
Running 19 checks on your project...
Unexpected error while running 'Check Expo config (app.json/ app.config.js) schema' check:
SyntaxError: Unexpected token 'H', "Host not i"... is not valid JSON
17/19 checks passed. 2 checks failed.
✖ Check Expo config (app.json/ app.config.js) schema
✖ Validate packages against React Native Directory package metadata
Directory check failed with unexpected server response
```

`expo-doctor apps/mobile`, run separately because the script throws before
reaching it, fails the identical two and passes the identical seventeen.
Confirmed against CI rather than chased: **run 134 on `74a3d1d` is a full
success on all five jobs**, where a clean install and real network run both
doctors.

Everything before that point passes: `biome check:ci` over 884 files with no
fixes, `release:config-check`, `check-types` **16 of 16**, `turbo test` **10
of 10**, `bun audit --production` with no vulnerabilities. Because the script
throws at `expo-doctor`, `build` and `knip` never execute inside it; both were
run directly and both pass — `bun run build` 4 of 4, knip exit 0.

**Suites: 2,595 tests.** `apps/site` 1,610 in 124 files (Stage 8 closed at
1,523 in 113); `packages/ui-web` 481 in 33 (was 475 in 32); `apps/mobile` 174
in 20; `packages/ui-native` 142 in 22; `packages/styles` 81 in 4; `packages/shared`
34 in 2; `apps/web` 33 in 2; `packages/convex` 29 in 5; `packages/hooks` 9 in 1;
`apps/native` 2 in 1.

### One local-only trap, found by measuring

Running the site suite repeatedly in one checkout eventually fails
`src/endpoints/account.int.test.ts` — **not on an assertion**: 1,610 of 1,610
tests pass and the *suite* fails in `afterAll` with

```
D1_ERROR: too many SQL variables at offset 821: SQLITE_ERROR
  on: delete from "payload_preferences" where key in (?, ? …)
```

The teardown is `payload.delete({ collection: "users", where: { email: { like:
"account-" } } })` — unbounded, and `.wrangler/state/vitest` is persisted, so
the `account-*` users accumulate across every local run until the delete
crosses D1's 100-bound-parameter cap. It is **exactly** the hazard Task 5's
review found in `pruneRateLimits` (I1) and that `jobs/cleanupOrphanedMedia.ts`
already documents, in a Stage 4 test teardown (`7de5b5a`) this stage never
touched. CI never sees it, because every CI run starts from an empty
persistence directory. Clearing `apps/site/.wrangler/state` clears it; every
measurement above was taken from a cleared state. Recorded so the next person
does not debug it, and because the same unbounded-delete shape is now known to
exist in at least three places in this repo.

### Two structural guarantees that no assertion pins

Task 7's mutation exercise produced a finding better than its fix, and the
exit must say it plainly rather than let the tests take credit:

1. **`trackEvent`'s `void` return type is what makes a blocking dependency on
   the beacon impossible.** Re-measured here: putting a literal `await` in
   front of both `trackEvent` calls in `FavoriteButton.tsx` (and making the
   handler `async`) leaves **35/35 green**, because `await` on `void` resolves
   immediately whatever the network does. Only a *composite* mutation —
   `trackEvent` returning `Promise<void>` **and** the `await` moved before
   `setState` — reproduces the real bug shape.
2. **`trackEvent`'s internal `.catch()` swallows rejections before any caller
   can observe them.** Measured here: deleting the `.catch()` entirely leaves
   `analytics.test.ts` at **5/5**, *including* `never throws when the relay
   request fails` — because a rejected promise never throws synchronously, and
   `.not.toThrow()` around a synchronous call cannot see it.

**Neither property is pinned by any assertion in the repo, and no test asserts
`trackEvent`'s return value or type at all.** A future change to
`Promise<void>` would be silent. The two new FavoriteButton tests do cover the
*behaviour*; they do not hold up the *mechanism*. That is written here so
nobody reads the green suite as protection it is not.

### What was deliberately NOT built, and why

These are decisions with reasons, not gaps nobody noticed.

- **The privacy policy ships Dutch-only while the banner is trilingual**
  (Ruling 7). Verified at this exit: `ConsentBanner`'s `COPY` has `en`, `fr`
  and `nl`; `[locale]/privacy/page.tsx` renders one Dutch body at all three
  locales. A French reader pressing "Politique de confidentialité" lands on
  Dutch text. Policy copy is a legal statement about what this organisation
  does with data, and writing it in two more languages here would be
  fabricating the most consequential text in the stage. Professional
  translation and legal review are on the blocked list below.
- **`gesture_collection_changed` with `collection: "list"` is unemitted**
  (Ruling 13). The list add/remove flow is a `<form method="post">` at a
  `next.config.ts` rewrite and that page's own doc comment states it ships no
  client JavaScript by design. Wiring the event needs client JS on a page that
  deliberately has none. **The server cannot emit it either, and that is not
  convenience:** a server-side emit would violate Ruling 11, because the server
  knows the account's recorded row while the device's `localStorage` is what
  actually governs whether this browser is tracked — it would track a device
  whose own answer was "denied". The gate being client-side is the design, so
  an interaction with no client code has no gated way to report itself. List
  add/remove is therefore invisible in analytics; do not read its absence as
  zero usage.
- **The `FavoritesList` emitter was removed, not relabelled** (Ruling 15,
  superseding Ruling 14). `apps/web` does not track removing a favourite from
  the favourites listing — `trackAnalyticsEvent` appears only in
  `lists-context.tsx`'s picker-dialog flow, used from the browse grid and the
  detail page, never in `routes/lists.tsx`. So `apps/site` was about to start
  collecting an interaction neither stack has ever collected. Expanding what is
  collected about people, quietly, inside the stage that exists to ask their
  permission, is not a call to make on one's own authority.
  `FavoritesList.tsx` is byte-for-byte its pre-Task-7 self (`git diff f50d736~1`
  empty). Reversing this is one file and a test; it is offered to the user
  below rather than decided for them.
- **`video_playback_completed` has never had a web emitter.** Measured across
  the whole repo: the only call site is `apps/native/screens/GestureScreen.tsx:70`.
  Not a regression and not an omission of this stage — a video-completion
  signal has only ever existed on the phone.
- **The sponsorship funnel, auth and shared lists emit nothing**, on either
  stack. `apps/site` has exactly four emitters —
  `GestureViewTracker.tsx:28` (`gesture_viewed`), `FavoriteButton.tsx:189` and
  `:223` (`gesture_collection_changed`), `GestureResults.tsx:66`
  (`search_performed`) — mirroring `apps/web`'s five. Adding any other event is
  new data collection and belongs to a stage where that is the subject.

### The deferred minors, triaged

Sixteen minors were deferred across Tasks 3–6. None blocks merge. They split
three ways, and the middle group is the one worth acting on soon.

**Fix before merge: none.** Every one of the sixteen is either a comment that
is wrong about code that is right, or a shape question with no behavioural
consequence. Nothing here can produce an incorrect result, lose a row, or let a
request through that should be refused.

**Should be fixed next time the file is opened (six, in five bullets),
because each is a statement in the repo that is false and will mislead a
reader:**

- `RateLimits.ts` says the retention period is "measured in minutes". It is
  not: `RETAIN_SECONDS` is 3600 and the sweep is hourly, so a row lives up to
  about two hours. Verified at this exit. A retention claim in a comment about
  personal data is the wrong thing to have wrong.
- `jobs/index.ts:344` says the task list "keeps the spec's four tasks four".
  There are **five** slugs in that file — `send-email`, `expire-sponsorships`,
  `send-renewal-reminders`, `cleanup-stale-payments`, `prune-rate-limits`.
  Verified at this exit.
- Task 5's migration precedent is miscited: the real ones are `20260920_103500`
  and `20260920_114500`, not `add_claims`.
- `postConsent`'s comment describes return-value handling its caller does not
  do, and another comment says "the test below" for a test in a different file.
- The name `postConsent` denotes two different things — the browser function in
  `ConsentSync.tsx` and the endpoint handler in `endpoints/consent.ts`.

**Genuinely deferrable (nine):** `Banner` does not forward a ref while every
other exported `packages/ui-web` component does (Task 3 — and the brief's
Interfaces block specified the plain function, so it is the plan's shape, not a
deviation; a library component breaking the package's declared shape is worth a
decision, not a scramble); the `down` migration's locked-documents rebuild is
hand-adapted and unexecuted by any test; a wrangler comment overclaims what a
var separates; Task 5's report gave the wrong reason for there being no
`cloudflare-env.d.ts` diff (the file is gitignored, not per-environment);
`RECORD_COPY[*].heading` is written in three locales and never rendered (knip
does not inspect object properties); `withdrewConsent` duplicates a query
`newestConsentDecision` already owns; a rapid double-toggle can leave one
redundant `user-consents` row (append-only is the design, so an extra row is
noise, not corruption); the Banner `label` and the privacy body are the
implementer's own words rather than pre-reviewed i18n strings (subsumed by the
translation and legal review below); `.append` → `.appendChild` in a test, which
is what the neighbouring tests already use.

**One deserves its own line, because it is a test that cannot fail for the
reason it claims:** Task 6's brief-mandated guard test asserts only that the
owner has 0 rows and never that the stranger got 1, so it would also pass
against a handler that refused everything. That is the eleventh
could-not-fail-as-described assertion this project has caught, and the eighth
originating in plan text — mine. It is not a live bug (the handler is correct,
and other tests cover the write), but it is exactly the shape this stage has
now been burned by three times.

### Carried out of Stage 8.5

**1. Stage 9 is unblocked, and here is what it must do.**
`user-consents` now has a real writer, so "no row" and "a row saying no" are
finally distinguishable in this application. The import must **set
`analytics_consent` explicitly for every row it writes**, because the column is
`integer DEFAULT false NOT NULL` and an import that omits it records an
explicit refusal — silently, for everyone. And its dry run must **assert the
resulting distribution against the source data rather than trusting the
insert**. The mutation in criterion 2 above is the shape of the defect: a
reconciler that writes only on `true` passes every "consent was recorded" test
and loses every refusal.

**2. The three stacks use three different consent stores, and Stage 9 must
decide what, if anything, migrates.** It is not a key rename:

| stack | key | storage | values |
|---|---|---|---|
| `apps/web` | `smog_analytics_consent` | `localStorage` | `"true"` / `"false"` |
| `apps/native` | `@smog_analytics_consent` (`packages/config/src/constants.ts:96`) | `AsyncStorage` | `"true"` / `"false"` |
| `apps/site` | `smog.consent.analytics` (`src/lib/consentStore.ts:39`) | `localStorage` | `"granted"` / `"denied"` |

The value vocabulary differs too, and the site's store is **tri-state**: absent
means undecided, which neither old store can express — `apps/web` reads a
missing key and a `"false"` the same way. A migration that maps `"false"` →
`"denied"` would convert "never asked" into a recorded refusal on every device
that never answered, which is the browser-side twin of the `analytics_consent`
import hazard. `apps/site` additionally keeps a second key,
`smog.consent.synced`, which records *which account* the row was posted for.

**3. `apps/mobile` has no analytics at all.** Confirmed by search: no
dependency, no module, no prompt, no consent key — zero references in the whole
workspace. That is deliberate (a tracker before a way to record a refusal is
the mistake this stage exists to prevent) and it is a **real gap**, because the
old native app has both. Whether the new app gets consent and tracking is
Stage 10's decision, not an oversight.

**4. The relay's honest limitation, restated (Ruling 2).** A guest's gate is
client-side only, because a guest's consent lives locally and there is nothing
to look up server-side for an anonymous visitor. The relay refuses a cross-site
post, an event outside the allowlist, anything over the rate limit, and — when
the request carries a session — an event whose account's newest row says
`false`. A determined client can still send events it was not authorised to
send. That is true of every browser-side analytics gate and is why the
allowlist and the limiter exist; it is stated here rather than in a comment
claiming a guarantee the code does not provide.

**5. `packages/ui-web`'s knip asymmetry (Ruling 6).** `knip.json`'s `workspaces`
map covers eight workspaces and `packages/ui-web` is not one of them, so knip
falls back to `package.json`'s `main`/`types`/`exports` — all `./src/index.ts`
— and **never reports an entry file's own exports**. For a library that is
correct: an export with no in-repo importer is public API, not dead code. The
asymmetry to know is that **the identical construct fails CI in `apps/site`'s
`src/lib` and passes in `ui-web`'s `index.ts`**, which is why Task 2 needed
Ruling 5 and Task 3 needed nothing, and why moving a symbol between the two
changes whether CI can see it. This is **not** Stage 8's `apps/mobile` defect
repeating, where the entry glob was `src/**/*.ts` and swallowed ordinary
internal modules.

**6. What this stage learned about its own evidence.** Eight defects traced to
this plan's own text — an export that broke CI, a test assertion that could not
fail, a `-t` filter matching no test (`-t "concurrent"` against a test named
"holds under concurrency": reproduced at this exit as `1 skipped (1)` / `6
skipped (6)`, **exit 0, having asserted nothing**), illustrative copy that did
not match the i18n JSON, a gate quoting another stack's API, a script named two
ways in one brief, a guard test that could pass against a handler refusing
everything, and a fallback design that was no limiter. **Every one was found by
an implementer or reviewer reading shipped code instead of the plan.** The rule
holds: when the plan and the code disagree, the code is right.

### Blocked on the user

- **The Cloudflare API token still needs rotating.** Exposed in a session
  transcript; carried unchanged from Stages 7 and 8. Every bundle measurement
  above runs against it. **Blocks:** nothing in the code, everything in the
  account's safety.
- **OpenPanel client id and secret for the site.** `wrangler secret put
  OPENPANEL_CLIENT_ID --env=staging` and the same for
  `OPENPANEL_CLIENT_SECRET`, per environment; **never in the repo** — a `vars`
  entry would undo the entire relay while looking like configuration. Until
  both are set the relay accepts events and drops them with a logged warning,
  which is the state every local checkout and CI is in. **Blocks:** any event
  reaching OpenPanel at all. The banner, the row, the limiter and the allowlist
  all work without them.
- **A decision on `analytics.zias.be` and the new origin.** One correction to
  how this was framed: the relay posts **server-to-server** from the Worker to
  `${OPENPANEL_API_URL}/track`, so browser CORS never applies to it. What still
  needs a decision is whether the self-hosted OpenPanel project at
  `analytics.zias.be` issues a client id/secret for this new origin and accepts
  its events, or whether the two sites share one project — which determines
  whether the old and new stacks' data are comparable or separate.
  **Blocks:** the meaning of the data, not its delivery.
- **Professional translation and legal review of the privacy policy** (Ruling
  7). **Blocks:** a non-Dutch visitor being able to read the policy they are
  consenting against. The banner already links to it in all three locales.
- **One offer, needing only a yes or no:** re-add the favourites-listing
  emitter removed under Ruling 15. It would give a signal neither stack has
  ever had — how often people remove a favourite from the favourites page —
  at the cost of collecting one interaction more than before. One file, one
  test. It was removed rather than shipped because starting new collection
  inside the consent stage is the user's call, not the implementer's.
