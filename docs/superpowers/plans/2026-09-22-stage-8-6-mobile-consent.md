# Stage 8.6: Mobile Consent and Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/mobile` asks for analytics consent with a non-blocking prompt, records a signed-in person's decision the same way the web does, and — only once consent is granted — sends the five events `apps/native` sent, directly to OpenPanel from the device.

**Architecture:** A tri-state consent store over AsyncStorage (`src/lib/consent.ts`) is the single source of truth on the device. Three consumers read it: a `ConsentBanner` rendered *in layout flow* below the navigator (so it covers nothing), a `useConsentSync` hook that ports the web's `ConsentSync` reconciliation to an asynchronous store, and a lazily constructed OpenPanel client (`src/lib/analytics.ts`) whose every send re-checks the store. Emitters call `trackEvent` at five call sites.

**Tech Stack:** Expo SDK 55, expo-router, React Native 0.83, `@react-native-async-storage/async-storage` 2.2.0, `@openpanel/react-native` 1.4.1 (already patched at the monorepo root), `@smog/ui-native`, `@smog/shared` (for `AnalyticsEventMap`), jest-expo + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-09-19-payload-migration-design.md`, section "Decisions taken 2026-09-22, after Stage 8.5 landed". The web implementation this ports is Stage 8.5 (`docs/superpowers/plans/2026-09-22-stage-8-5-consent.md`), especially `apps/site/src/components/ConsentSync.tsx` and `apps/site/src/lib/consentStore.ts`.

## Global Constraints

- Consent is a tri-state: `"granted" | "denied" | null`. `null` means *never asked* and is never written as `false`.
- Storage keys: `smog.consent.analytics` (decision, the string `"granted"` or `"denied"`) and `smog.consent.synced` (sync marker, JSON `{ userId: string, value: string, pending?: true }`). These match the web's names exactly.
- The legacy `apps/native` key `@smog_analytics_consent` is **never read**. Decided: nobody's old answer carries over; everyone is re-asked.
- The prompt is **non-blocking**: no `Modal`, no `Sheet`, no scrim, nothing that stops the app underneath from being used or the privacy policy from being opened.
- Analytics goes **direct from the device to OpenPanel** via `@openpanel/react-native`, configured by `EXPO_PUBLIC_OPENPANEL_API_URL`, `EXPO_PUBLIC_OPENPANEL_CLIENT_ID`, `EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET` — the *separate least-privileged native client* already in the root `.env.example`, never the web pair.
- **No account identity reaches OpenPanel.** No `identify`, no `profileId`, no user id or email in any event property. The published privacy policy says events "are not linked to your account, even when you are signed in"; `apps/native` did identify users, and that is exactly the part this port must not carry.
- The events are exactly `apps/native`'s five: `gesture_viewed`, `video_playback_completed`, `search_performed`, `gesture_collection_changed` (lists only), `screen_view`. The favourites emitter stays out (decided). Every event carries `platform: "native"`, as `apps/native`'s did.
- Consent rows are written only for a signed-in person, via `POST /api/consent` with body `{ "analyticsConsent": boolean }` and `Authorization: JWT <token>` (`payloadFetch(..., { auth: true })`). A guest's decision stays on the device.
- Tests live under `apps/mobile/src/`, never under `app/` (`src/boundary.test.ts`). Every new `src/` export must be imported by a route under `app/` or by a test, or knip fails CI.
- Copy comes from `@smog/i18n`'s existing `settings.analytics*` keys via `t()`. No new strings except where stated.
- Errors: `console.warn("[moduleName] …", error)` for swallowed storage failures, `console.error` for failed network writes, matching `apps/site`'s consent code.

## Review Focus

1. **Two reconcile passes in flight at once.** AsyncStorage is asynchronous, so the web's synchronous `reconciling` flag does not serialise anything here: a consent change and a session change arriving together would both read the old marker and both POST. Expected: one POST. Pinned in Task 4, "serialises passes".
2. **The prompt flashing before the stored decision loads.** On every cold start the store is unknown for a few milliseconds; rendering the banner for `null` during that window shows a returning user a prompt they already answered. Expected: nothing until loaded. Pinned in Tasks 1 and 3.
3. **Signing out on a device whose decision was recorded for an account.** Expected, as on the web: the decision is dropped and the next person is asked, rather than inheriting it. Pinned in Task 4.
4. **Account identity leaking into analytics.** Expected: no `identify` call, and no event property naming a user, ever. Pinned in Task 5.
5. **The consent POST failing — offline, 429, 5xx.** Expected: the marker stays `pending`, and the next pass (including the app returning to the foreground) retries. Pinned in Task 4.

---

## Task 1: The consent store

**Files:**
- Create: `apps/mobile/src/lib/consent.ts`
- Test: `apps/mobile/src/lib/consent.test.ts`

**Interfaces:**
- Consumes: `@react-native-async-storage/async-storage` (mocked globally in `jest.setup.ts`).
- Produces:
  - `type ConsentState = "granted" | "denied" | null`
  - `const ANALYTICS_CONSENT_KEY = "smog.consent.analytics"`
  - `loadConsent(): Promise<ConsentState>` — reads storage once; later calls return the cached value.
  - `readConsent(): ConsentState` — synchronous; `null` until loaded.
  - `isConsentLoaded(): boolean`
  - `setConsent(value: "granted" | "denied"): Promise<void>`
  - `clearConsent(): Promise<void>`
  - `subscribeConsent(listener: () => void): () => void`
  - `useConsent(): { consent: ConsentState; loaded: boolean }` — `useSyncExternalStore` over the above.
  - `resetConsentForTests(): void` — clears the in-memory cache; tests only. It does **not** clear listeners: `src/lib/analytics.ts` subscribes once at import to clear its client on withdrawal, and a reset that dropped that subscription would make every later withdrawal test pass or fail for the wrong reason. Hook subscriptions clean themselves up on unmount.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/mobile/src/lib/consent.test.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import {
  ANALYTICS_CONSENT_KEY,
  clearConsent,
  isConsentLoaded,
  loadConsent,
  readConsent,
  resetConsentForTests,
  setConsent,
  subscribeConsent,
  useConsent,
} from "./consent";

beforeEach(async () => {
  await AsyncStorage.clear();
  resetConsentForTests();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the consent store", () => {
  it("is undecided, not refused, when nothing is stored", async () => {
    expect(await loadConsent()).toBeNull();
    expect(isConsentLoaded()).toBe(true);
  });

  it("reads back a stored decision", async () => {
    await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    expect(await loadConsent()).toBe("granted");
    expect(readConsent()).toBe("granted");
  });

  it("treats a value it did not write as undecided", async () => {
    // The legacy native store wrote "true"/"false" under another key; a
    // garbage value under ours must re-ask, not be guessed at.
    await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, "true");
    expect(await loadConsent()).toBeNull();
  });

  it("never reads the legacy apps/native key", async () => {
    await AsyncStorage.setItem("@smog_analytics_consent", "true");
    expect(await loadConsent()).toBeNull();
  });

  it("persists a decision and notifies subscribers", async () => {
    await loadConsent();
    const listener = jest.fn();
    const unsubscribe = subscribeConsent(listener);

    await setConsent("denied");

    expect(readConsent()).toBe("denied");
    expect(await AsyncStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("denied");
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("clears back to undecided", async () => {
    await setConsent("granted");
    await clearConsent();
    expect(readConsent()).toBeNull();
    expect(await AsyncStorage.getItem(ANALYTICS_CONSENT_KEY)).toBeNull();
  });

  it("keeps the decision for this session when storage refuses the write", async () => {
    jest
      .spyOn(AsyncStorage, "setItem")
      .mockRejectedValueOnce(new Error("disk full"));
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    await setConsent("granted");

    expect(readConsent()).toBe("granted");
  });

  it("reports not-loaded before the first read resolves (Review Focus 2)", async () => {
    await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    const { result } = renderHook(() => useConsent());

    expect(result.current).toEqual({ consent: null, loaded: false });
    await waitFor(() =>
      expect(result.current).toEqual({ consent: "granted", loaded: true })
    );
  });

  it("re-renders a hook consumer when the decision changes", async () => {
    const { result } = renderHook(() => useConsent());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await setConsent("granted");
    });

    expect(result.current.consent).toBe("granted");
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `bun -F mobile test -- src/lib/consent.test.ts`
Expected: FAIL, `Cannot find module './consent'`.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/lib/consent.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";

/**
 * The device's analytics-consent decision, as a tri-state.
 *
 * `null` is "never asked", not "refused": the consent row this eventually
 * writes has a boolean column that cannot tell the two apart, which is
 * exactly why the device must. The key and values match `apps/site`'s
 * `lib/consentStore.ts`, so the two apps describe one decision one way.
 *
 * The old app's `@smog_analytics_consent` is deliberately never read: every
 * person is re-asked under the new policy (spec, "Decisions taken
 * 2026-09-22").
 *
 * AsyncStorage is asynchronous, so unlike the web store this one has a
 * fourth state the UI must respect — *not loaded yet* — and `useConsent`
 * reports it separately rather than letting `null` mean both.
 */
export type ConsentState = "granted" | "denied" | null;

export const ANALYTICS_CONSENT_KEY = "smog.consent.analytics";

let current: ConsentState = null;
let loaded = false;
let loading: Promise<ConsentState> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function parse(raw: string | null): ConsentState {
  return raw === "granted" || raw === "denied" ? raw : null;
}

export function loadConsent(): Promise<ConsentState> {
  if (loaded) {
    return Promise.resolve(current);
  }
  if (loading === null) {
    loading = AsyncStorage.getItem(ANALYTICS_CONSENT_KEY)
      .then(parse)
      .catch((error: unknown) => {
        console.warn("[consent] Failed to read the stored decision:", error);
        return null;
      })
      .then((value) => {
        current = value;
        loaded = true;
        loading = null;
        emit();
        return value;
      });
  }
  return loading;
}

export function readConsent(): ConsentState {
  return current;
}

export function isConsentLoaded(): boolean {
  return loaded;
}

export async function setConsent(value: "granted" | "denied"): Promise<void> {
  current = value;
  loaded = true;
  emit();
  try {
    await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, value);
  } catch (error) {
    console.warn("[consent] Failed to persist the decision:", error);
  }
}

export async function clearConsent(): Promise<void> {
  current = null;
  loaded = true;
  emit();
  try {
    await AsyncStorage.removeItem(ANALYTICS_CONSENT_KEY);
  } catch (error) {
    console.warn("[consent] Failed to clear the decision:", error);
  }
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

interface Snapshot {
  consent: ConsentState;
  loaded: boolean;
}

let snapshot: Snapshot = { consent: current, loaded };

function getSnapshot(): Snapshot {
  if (snapshot.consent !== current || snapshot.loaded !== loaded) {
    snapshot = { consent: current, loaded };
  }
  return snapshot;
}

export function useConsent(): Snapshot {
  const value = useSyncExternalStore(subscribeConsent, getSnapshot);
  useEffect(() => {
    loadConsent();
  }, []);
  return value;
}

/**
 * Tests only: forget the in-memory decision so each test starts cold.
 * Listeners are kept on purpose — `lib/analytics.ts` subscribes once, at
 * import, and must still hear the next withdrawal.
 */
export function resetConsentForTests(): void {
  current = null;
  loaded = false;
  loading = null;
  snapshot = { consent: null, loaded: false };
}
```

- [ ] **Step 4: Run the tests**

Run: `bun -F mobile test -- src/lib/consent.test.ts`
Expected: 9 passing.

- [ ] **Step 5: Prove the flash test can fail**

Temporarily change `getSnapshot` to return `{ consent: current, loaded: true }` initially (i.e. set `let loaded = true`). Run the file; the "reports not-loaded" test must FAIL. Restore, confirm `git diff --stat` shows only the new files.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/consent.ts apps/mobile/src/lib/consent.test.ts
git commit -m "feat(mobile): a tri-state consent store over AsyncStorage"
```

---

## Task 2: `Banner` in `@smog/ui-native`

`@smog/ui-web` has a `Banner` (non-modal, labelled region, no scrim); `@smog/ui-native` has none. The two libraries share a philosophy, not an implementation: the web banner is `fixed` because a page can reserve space with a spacer; the native one sits **in layout flow**, so the navigator above it shrinks and nothing is covered at all — the native equivalent of Stage 8.5's spacer.

**Files:**
- Create: `packages/ui-native/src/components/Banner.tsx`
- Test: `packages/ui-native/src/components/Banner.test.tsx`
- Modify: `packages/ui-native/src/index.ts` (export `Banner`, `type BannerProps`)
- Modify: `packages/ui-native/src/components/contract.test.tsx` only if it enumerates components explicitly (read it first; follow its pattern)

**Interfaces:**
- Produces: `Banner({ label: string; children: ReactNode; className?: string; testID?: string } & Omit<ViewProps, "children">)`. Root has `testID="root"` by default, `role="region"`, `accessibilityLabel={label}`. Consumes the bottom safe-area inset itself (`useSafeAreaInsets().bottom` as bottom padding).

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/ui-native/src/components/Banner.test.tsx
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Banner } from "./Banner";

const metrics = {
  frame: { height: 800, width: 400, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 47 },
};

function renderBanner(props: Partial<Parameters<typeof Banner>[0]> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Banner label="Analytics" {...props}>
        <Text>body</Text>
      </Banner>
    </SafeAreaProvider>
  );
}

describe("Banner", () => {
  it("renders its children in a labelled region", () => {
    renderBanner();
    const root = screen.getByTestId("root");
    expect(root.props.role).toBe("region");
    expect(root.props.accessibilityLabel).toBe("Analytics");
    expect(screen.getByText("body")).toBeTruthy();
  });

  it("is not a modal: nothing in its tree is an RN Modal", () => {
    const { UNSAFE_queryAllByType } = renderBanner();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Modal } = require("react-native");
    expect(UNSAFE_queryAllByType(Modal)).toHaveLength(0);
  });

  it("pads itself by the bottom safe-area inset it sits on", () => {
    renderBanner();
    const style = [screen.getByTestId("root").props.style].flat(Infinity);
    expect(style).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 34 + 16 })])
    );
  });

  it("lets a caller's className reach the root", () => {
    renderBanner({ className: "bg-danger" });
    expect(screen.getByTestId("root")).toBeTruthy();
  });
});
```

(If `contract.test.tsx` iterates every export, add `Banner` to its table with `label` and `children` props, following the existing rows.)

- [ ] **Step 2: Run to see them fail**

Run: `bun -F @smog/ui-native test -- Banner`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
// packages/ui-native/src/components/Banner.tsx
import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "../lib/cn";

/**
 * A non-modal notice pinned to the bottom of the screen — `@smog/ui-web`'s
 * `Banner`, in the native idiom.
 *
 * Same philosophy: a labelled region, no scrim, no focus trap, and nothing
 * that stops the app underneath from being used. Different mechanics: the
 * web banner is `fixed` and relies on a spacer; this one is meant to be
 * rendered *in layout flow* below the navigator, so the navigator shrinks
 * and nothing is covered at all. It therefore owns the bottom safe-area
 * inset — the caller should tell the navigator above it that the inset is
 * already spent (see `apps/mobile/app/_layout.tsx`).
 *
 * `16` is the `md` spacing step, added to the inset rather than replacing it.
 */
export type BannerProps = Omit<ViewProps, "children"> & {
  label: string;
  children: ReactNode;
  className?: string;
};

export function Banner({
  children,
  className,
  label,
  style,
  testID = "root",
  ...props
}: BannerProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityLabel={label}
      className={cn(
        "gap-sm border-border-subtle border-t bg-surface-raised px-lg pt-md",
        className
      )}
      role="region"
      style={[{ paddingBottom: insets.bottom + 16 }, style]}
      testID={testID}
      {...props}
    >
      {children}
    </View>
  );
}
```

Add to `packages/ui-native/src/index.ts`, next to the other component exports:

```ts
export { Banner, type BannerProps } from "./components/Banner";
```

Check the class names exist in `packages/ui-native`'s tailwind theme (`border-border-subtle`, `bg-surface-raised`, `px-lg`, `pt-md`, `gap-sm`); replace any that do not with the nearest existing token rather than adding tokens.

- [ ] **Step 4: Run the package's tests and typecheck**

Run: `bun -F @smog/ui-native test && bun -F @smog/ui-native check-types`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-native/src/components/Banner.tsx packages/ui-native/src/components/Banner.test.tsx packages/ui-native/src/index.ts packages/ui-native/src/components/contract.test.tsx
git commit -m "feat(ui-native): a non-modal Banner, in layout flow"
```

---

## Task 3: The prompt the person actually sees

**Files:**
- Create: `apps/mobile/src/components/ConsentBanner.tsx`
- Test: `apps/mobile/src/components/ConsentBanner.test.tsx`
- Create: `apps/mobile/src/lib/site.ts` (the site origin and the privacy URL)
- Modify: `apps/mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: Task 1 (`useConsent`, `setConsent`), Task 2 (`Banner`), `t` and `useLocale` from `@/lib/i18n`, `API_BASE_URL` from `@/lib/api`, `openBrowserAsync` from `expo-web-browser`.
- Produces:
  - `privacyPolicyUrl(locale: Locale): string` in `src/lib/site.ts` → `${API_BASE_URL}/${locale}/privacy`.
  - `ConsentBanner(): JSX.Element | null` — renders only when `loaded && consent === null`.
  - `useConsentBannerVisible(): boolean` — the same condition, for the layout's inset override.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/mobile/src/components/ConsentBanner.test.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  ANALYTICS_CONSENT_KEY,
  readConsent,
  resetConsentForTests,
} from "@/lib/consent";
import { setLocale } from "@/lib/i18n";
import { ConsentBanner } from "./ConsentBanner";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

const metrics = {
  frame: { height: 800, width: 400, x: 0, y: 0 },
  insets: { bottom: 0, left: 0, right: 0, top: 0 },
};

function renderBanner() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ConsentBanner />
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetConsentForTests();
  setLocale("nl");
  jest.clearAllMocks();
});

describe("ConsentBanner", () => {
  it("asks someone who has never answered", async () => {
    renderBanner();
    expect(await screen.findByText("Toestaan")).toBeTruthy();
  });

  it("does not render at all before the stored answer has loaded (Review Focus 2)", () => {
    // Synchronously after mount, the store has not resolved yet.
    renderBanner();
    expect(screen.queryByText("Toestaan")).toBeNull();
  });

  it.each(["granted", "denied"])(
    "stays away for someone who already answered %s",
    async (value) => {
      await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, value);
      renderBanner();
      await waitFor(() => expect(readConsent()).toBe(value));
      expect(screen.queryByText("Toestaan")).toBeNull();
    }
  );

  it("records a grant and goes away", async () => {
    renderBanner();
    fireEvent.press(await screen.findByText("Toestaan"));
    await waitFor(() => expect(readConsent()).toBe("granted"));
    expect(screen.queryByText("Toestaan")).toBeNull();
  });

  it("records a refusal, never a missing answer, for 'required only'", async () => {
    renderBanner();
    fireEvent.press(await screen.findByText("Alleen noodzakelijk"));
    await waitFor(() => expect(readConsent()).toBe("denied"));
  });

  it("opens the privacy policy in the current locale without answering", async () => {
    setLocale("fr");
    renderBanner();
    fireEvent.press(await screen.findByTestId("consent-privacy"));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      expect.stringMatching(/\/fr\/privacy$/)
    );
    expect(readConsent()).toBeNull();
  });
});
```

The button labels above are `settings.analyticsAllow` / `settings.analyticsRequiredOnly` in `packages/i18n/src/locales/nl.json`. **Read that file and use the exact strings it holds**; if they differ from "Toestaan" / "Alleen noodzakelijk", change the test to match the JSON, not the JSON to match the test.

- [ ] **Step 2: Run to see them fail**

Run: `bun -F mobile test -- src/components/ConsentBanner.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/lib/site.ts
import { API_BASE_URL } from "@/lib/api";
import type { Locale } from "@/lib/locale";

/**
 * The site's own privacy policy. `API_BASE_URL` is the site's origin — the
 * Payload REST API is mounted under `/api` on the same Worker — so the page
 * lives beside it, per locale. The EN and FR versions are unreviewed drafts
 * that say so at the top; that is the site's concern, not this link's.
 */
export function privacyPolicyUrl(locale: Locale): string {
  return `${API_BASE_URL}/${locale}/privacy`;
}
```

(Read `src/lib/api.ts` first: confirm `API_BASE_URL` is exported and has no trailing `/api`. If it does include `/api`, strip it here and say so in the comment.)

```tsx
// apps/mobile/src/components/ConsentBanner.tsx
import { Banner, Button, Text } from "@smog/ui-native";
import { openBrowserAsync } from "expo-web-browser";
import { Pressable, View } from "react-native";
import { setConsent, useConsent } from "@/lib/consent";
import { t, useLocale } from "@/lib/i18n";
import { privacyPolicyUrl } from "@/lib/site";

/**
 * The analytics prompt: non-blocking, unlike `apps/native`'s full-screen
 * modal. A prompt standing between a person and the privacy policy it links
 * to is the pattern regulators single out (spec, "Decisions taken
 * 2026-09-22"; Stage 8.5 Ruling 11 for the web).
 *
 * Renders nothing until the stored answer has loaded, so a returning person
 * never sees a flash of a question they already answered.
 */
export function useConsentBannerVisible(): boolean {
  const { consent, loaded } = useConsent();
  return loaded && consent === null;
}

export function ConsentBanner() {
  const visible = useConsentBannerVisible();
  const { locale } = useLocale();

  if (!visible) {
    return null;
  }

  return (
    <Banner label={t("settings.analyticsPromptTitle")}>
      <Text variant="heading">{t("settings.analyticsPromptTitle")}</Text>
      <Text variant="muted">{t("settings.analyticsPromptDescription")}</Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => openBrowserAsync(privacyPolicyUrl(locale))}
        testID="consent-privacy"
      >
        <Text className="underline">{t("settings.privacyPolicy")}</Text>
      </Pressable>
      <View className="flex-row gap-sm">
        <Button onPress={() => setConsent("granted")} testID="consent-allow">
          {t("settings.analyticsAllow")}
        </Button>
        <Button
          onPress={() => setConsent("denied")}
          testID="consent-required-only"
          variant="secondary"
        >
          {t("settings.analyticsRequiredOnly")}
        </Button>
      </View>
    </Banner>
  );
}
```

Check `Button`'s `variant` values and `Text`'s `variant` values in `packages/ui-native` and use existing ones; do not add variants. Check `useLocale()`'s return shape in `src/lib/i18n.ts:93` and adjust the destructuring to it.

Then mount it in `apps/mobile/app/_layout.tsx`. The navigator goes in a `flex-1` view with the banner *after* it, in flow. While the banner is visible it owns the bottom inset, so the navigator's subtree is told the bottom inset is zero — otherwise the tab bar pads itself for a home indicator the banner is already sitting on:

```tsx
// apps/mobile/app/_layout.tsx — replace the returned tree
import { View } from "react-native";
import {
  SafeAreaInsetsContext,
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  ConsentBanner,
  useConsentBannerVisible,
} from "@/components/ConsentBanner";

function Navigator() {
  const insets = useSafeAreaInsets();
  const bannerVisible = useConsentBannerVisible();

  return (
    <View className="flex-1">
      <SafeAreaInsetsContext.Provider
        value={bannerVisible ? { ...insets, bottom: 0 } : insets}
      >
        <View className="flex-1">
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      </SafeAreaInsetsContext.Provider>
      <ConsentBanner />
    </View>
  );
}

export default function RootLayout() {
  useInitialLocale();

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <ToastProvider>
          <Navigator />
        </ToastProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
```

Add a doc comment on `Navigator` explaining the inset override in two sentences, in the file's existing comment style.

- [ ] **Step 4: Run the tests, the full mobile suite, and typecheck**

Run: `bun -F mobile test && bun -F mobile check-types`
Expected: all pass. Existing screen tests render routes directly, not `RootLayout`, so they are unaffected; if any renders `RootLayout`, seed `smog.consent.analytics` in its `beforeEach` rather than changing its assertions.

- [ ] **Step 5: Prove the load guard can fail**

Change `useConsentBannerVisible` to `return consent === null;`. The "does not render at all before the stored answer has loaded" test must FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components apps/mobile/src/lib/site.ts apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): a non-blocking consent prompt that covers nothing"
```

---

## Task 4: Recording a signed-in person's decision

A port of `apps/site/src/components/ConsentSync.tsx`. **Read that file in full before starting** — its comments carry three fixed bugs (the marker surviving `clearConsent`; an unposted decision being inherited by the next account, fixed by the provisional `pending` marker; cross-tab echo). The rules, restated:

- Signed out, and a marker exists → the decision was attributed to an account: drop the decision *and* the marker (the next person is asked).
- Signed in, no decision → nothing to do.
- Signed in, a marker for a *different* user → drop decision and marker.
- Signed in, marker matches user and value, and is not pending → nothing to do.
- Otherwise → write a provisional marker `{userId, value, pending: true}`, POST, and on a 2xx rewrite it without `pending`. On failure leave it pending, so the next pass retries.

What differs on mobile: storage is asynchronous, so passes must be **serialised** (a promise chain), not guarded by a boolean; and there is no page load to retry on, so a pass also runs when the app returns to the foreground.

**Files:**
- Create: `apps/mobile/src/lib/consentSync.ts`
- Test: `apps/mobile/src/lib/consentSync.test.ts`
- Modify: `apps/mobile/app/_layout.tsx` (call the hook inside `SessionProvider`)

**Interfaces:**
- Consumes: Task 1's store; `payloadFetch` and `ApiError` from `@/lib/api`; `useSession` from `@/lib/session` (`user: { id: string } | null`, `loading: boolean`).
- Produces:
  - `const CONSENT_SYNCED_KEY = "smog.consent.synced"`
  - `reconcileConsent(userId: string | null): Promise<void>` — one pass, serialised against every other pass.
  - `useConsentSync(): void` — runs a pass on mount, when the user id changes, when consent changes, and on `AppState` → `"active"`; does nothing while the session is still loading.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/mobile/src/lib/consentSync.test.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  loadConsent,
  readConsent,
  resetConsentForTests,
  setConsent,
} from "./consent";
import { CONSENT_SYNCED_KEY, reconcileConsent } from "./consentSync";

jest.mock("expo-secure-store");

const ok = () =>
  Promise.resolve(
    new Response(JSON.stringify({ analyticsConsent: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
  );
const status = (code: number) =>
  Promise.resolve(
    new Response(JSON.stringify({ error: "x" }), {
      headers: { "Content-Type": "application/json" },
      status: code,
    })
  );

const marker = async () => {
  const raw = await AsyncStorage.getItem(CONSENT_SYNCED_KEY);
  return raw === null ? null : JSON.parse(raw);
};
const consentPosts = () =>
  (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
    String(url).includes("/api/consent")
  );

beforeEach(async () => {
  await AsyncStorage.clear();
  resetConsentForTests();
  await loadConsent();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("token");
  global.fetch = jest.fn(ok) as jest.Mock;
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("reconcileConsent", () => {
  it("sends nothing for a guest; the decision stays on the device", async () => {
    await setConsent("granted");
    await reconcileConsent(null);
    expect(consentPosts()).toHaveLength(0);
    expect(readConsent()).toBe("granted");
  });

  it("sends nothing for a signed-in person who has not answered", async () => {
    await reconcileConsent("7");
    expect(consentPosts()).toHaveLength(0);
  });

  it("records a signed-in decision with the session's own token", async () => {
    await setConsent("granted");
    await reconcileConsent("7");

    const [[url, init]] = consentPosts();
    expect(String(url)).toContain("/api/consent");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ analyticsConsent: true });
    expect(new Headers(init.headers).get("Authorization")).toBe("JWT token");
    expect(await marker()).toEqual({ userId: "7", value: "granted" });
  });

  it("records a refusal as false, not as nothing", async () => {
    await setConsent("denied");
    await reconcileConsent("7");
    expect(JSON.parse(consentPosts()[0][1].body)).toEqual({
      analyticsConsent: false,
    });
  });

  it("does not send the same decision twice", async () => {
    await setConsent("granted");
    await reconcileConsent("7");
    await reconcileConsent("7");
    expect(consentPosts()).toHaveLength(1);
  });

  it("sends again when the decision changes", async () => {
    await setConsent("granted");
    await reconcileConsent("7");
    await setConsent("denied");
    await reconcileConsent("7");
    expect(consentPosts()).toHaveLength(2);
  });

  it.each([429, 500, 503])(
    "keeps a %s pending and retries on the next pass (Review Focus 5)",
    async (code) => {
      global.fetch = jest.fn(() => status(code)) as jest.Mock;
      await setConsent("granted");
      await reconcileConsent("7");
      expect(await marker()).toEqual({ pending: true, userId: "7", value: "granted" });

      global.fetch = jest.fn(ok) as jest.Mock;
      await reconcileConsent("7");
      expect(consentPosts()).toHaveLength(1);
      expect(await marker()).toEqual({ userId: "7", value: "granted" });
    }
  );

  it("keeps an offline attempt pending too", async () => {
    global.fetch = jest.fn(() => Promise.reject(new TypeError("offline"))) as jest.Mock;
    await setConsent("granted");
    await reconcileConsent("7");
    expect((await marker()).pending).toBe(true);
  });

  it("drops an attributed decision on sign-out, so the next person is asked (Review Focus 3)", async () => {
    await setConsent("granted");
    await reconcileConsent("7");
    await reconcileConsent(null);
    expect(readConsent()).toBeNull();
    expect(await marker()).toBeNull();
  });

  it("drops a pending decision on sign-out as well — the next person must not inherit it", async () => {
    global.fetch = jest.fn(() => status(500)) as jest.Mock;
    await setConsent("granted");
    await reconcileConsent("7");
    await reconcileConsent(null);
    expect(readConsent()).toBeNull();
  });

  it("drops another account's decision rather than filing it under this one", async () => {
    await setConsent("granted");
    await reconcileConsent("7");
    (global.fetch as jest.Mock).mockClear();

    await reconcileConsent("8");

    expect(consentPosts()).toHaveLength(0);
    expect(readConsent()).toBeNull();
    expect(await marker()).toBeNull();
  });

  it("serialises passes: two at once send one request (Review Focus 1)", async () => {
    await setConsent("granted");
    await Promise.all([reconcileConsent("7"), reconcileConsent("7")]);
    expect(consentPosts()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `bun -F mobile test -- src/lib/consentSync.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/lib/consentSync.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { AppState } from "react-native";
import { payloadFetch } from "@/lib/api";
import { clearConsent, readConsent, subscribeConsent, loadConsent } from "@/lib/consent";
import { useSession } from "@/lib/session";

/**
 * Writes a signed-in person's analytics decision to `POST /api/consent`, once
 * per change — a port of `apps/site/src/components/ConsentSync.tsx`, whose
 * comments explain each rule below and the bug that produced it.
 *
 * Two things differ from the web, both because AsyncStorage is asynchronous:
 *
 * - Passes are chained, not flag-guarded. A synchronous `reconciling` flag
 *   only prevents re-entry within one tick; here a consent change and a
 *   session change can both be mid-`await` at once, both read the old
 *   marker, and both POST.
 * - There is no page load to retry on, so the hook also runs a pass when the
 *   app returns to the foreground. A failed write leaves its marker
 *   `pending`, and the next pass sends it again.
 */
export const CONSENT_SYNCED_KEY = "smog.consent.synced";

interface SyncMarker {
  pending?: true;
  userId: string;
  value: string;
}

function isSyncMarker(value: unknown): value is SyncMarker {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === "string" &&
    typeof candidate.value === "string" &&
    (candidate.pending === undefined || candidate.pending === true)
  );
}

async function readMarker(): Promise<SyncMarker | null> {
  try {
    const raw = await AsyncStorage.getItem(CONSENT_SYNCED_KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isSyncMarker(parsed) ? parsed : null;
  } catch (error) {
    console.warn("[consentSync] Failed to read the sync marker:", error);
    return null;
  }
}

async function writeMarker(marker: SyncMarker): Promise<boolean> {
  try {
    await AsyncStorage.setItem(CONSENT_SYNCED_KEY, JSON.stringify(marker));
    return true;
  } catch (error) {
    console.warn("[consentSync] Failed to persist the sync marker:", error);
    return false;
  }
}

async function clearMarker(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CONSENT_SYNCED_KEY);
  } catch (error) {
    console.warn("[consentSync] Failed to clear the sync marker:", error);
  }
}

async function dropForeignDecision(): Promise<void> {
  await clearConsent();
  await clearMarker();
}

async function postConsent(userId: string, value: "granted" | "denied"): Promise<void> {
  // Provisional first: if the app dies mid-request, the decision is already
  // attributed to this account, so a different person signing in next drops
  // it instead of inheriting it (Stage 8.5 whole-branch review, blocker A).
  if (!(await writeMarker({ pending: true, userId, value }))) {
    await clearConsent();
    return;
  }

  try {
    await payloadFetch("/consent", {
      auth: true,
      body: JSON.stringify({ analyticsConsent: value === "granted" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  } catch (error) {
    console.error("[consentSync] Failed to record consent:", error);
    return;
  }

  if (!(await writeMarker({ userId, value }))) {
    await clearConsent();
  }
}

async function pass(userId: string | null): Promise<void> {
  await loadConsent();
  const consent = readConsent();
  const marker = await readMarker();

  if (userId === null) {
    if (marker !== null) {
      await dropForeignDecision();
    }
    return;
  }
  if (consent === null) {
    return;
  }
  if (marker !== null && marker.userId !== userId) {
    await dropForeignDecision();
    return;
  }
  if (marker !== null && marker.value === consent && marker.pending !== true) {
    return;
  }
  await postConsent(userId, consent);
}

let queue: Promise<void> = Promise.resolve();

export function reconcileConsent(userId: string | null): Promise<void> {
  const next = queue.then(() => pass(userId));
  queue = next.catch(() => undefined);
  return next;
}

export function useConsentSync(): void {
  const { loading, user } = useSession();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (loading) {
      return;
    }
    const run = () => {
      reconcileConsent(userId);
    };
    run();
    const unsubscribe = subscribeConsent(run);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        run();
      }
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [loading, userId]);
}
```

**Note the loop the subscription creates:** `dropForeignDecision` calls `clearConsent`, which notifies subscribers, which queues another pass. That pass finds no marker and no consent and returns — it terminates, but confirm it with the test suite rather than by reading, and add a test if you change the order of operations.

Check `session.ts`'s `useSession()` return shape (`src/lib/session.ts:499`) and that `user.id` is a string; if it is a number, `String()` it where `userId` is derived.

Mount the hook in `app/_layout.tsx`, inside `SessionProvider` (it calls `useSession`). The simplest place is the `Navigator` component from Task 3: add `useConsentSync();` as its first line, with the import.

- [ ] **Step 4: Run the tests**

Run: `bun -F mobile test -- src/lib/consentSync.test.ts && bun -F mobile test && bun -F mobile check-types`
Expected: all pass.

- [ ] **Step 5: Prove the serialisation test can fail**

Replace the body of `reconcileConsent` with `return pass(userId);`. The "serialises passes" test must FAIL (two POSTs). Restore. Then remove the provisional `writeMarker({ pending: true, ... })` call: the "drops a pending decision on sign-out" test must FAIL. Restore; `git diff` must show only the intended changes.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/consentSync.ts apps/mobile/src/lib/consentSync.test.ts apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): record a signed-in decision once, serialised, retried"
```

---

## Task 5: The OpenPanel client

**Files:**
- Modify: `apps/mobile/package.json` — add `@openpanel/react-native` (`1.4.1`, exact, matching the root patch file name `patches/@openpanel%2Freact-native@1.4.1.patch`), `expo-application`, `expo-constants` (versions as pinned in the root `overrides`), and `@smog/shared` (`workspace:*`). Run `bun install` and commit `bun.lock`.
- Create: `apps/mobile/src/lib/analytics.ts`
- Test: `apps/mobile/src/lib/analytics.test.ts`
- Modify: `apps/mobile/app/_layout.tsx` (screen views)
- Modify: `apps/mobile/.env.example` if it exists, else note in Task 8 that the root `.env.example` already carries the three `EXPO_PUBLIC_OPENPANEL_*` names.

**Interfaces:**
- Consumes: Task 1's store; `AnalyticsEventMap`, `AnalyticsEventName` from `@smog/shared` (type-only import).
- Produces:
  - `trackEvent<E extends AnalyticsEventName>(name: E, properties: AnalyticsEventMap[E]): void`
  - `trackScreenView(path: string): void`
  - `resetAnalyticsForTests(): void`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/mobile/src/lib/analytics.test.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as analytics from "./analytics";
import { loadConsent, resetConsentForTests, setConsent } from "./consent";

const mockTrack = jest.fn();
const mockScreenView = jest.fn();
const mockIdentify = jest.fn();
const mockClear = jest.fn();
const mockConstructed = jest.fn();

jest.mock("@openpanel/react-native", () => ({
  OpenPanel: jest.fn().mockImplementation((options: unknown) => {
    mockConstructed(options);
    return {
      clear: mockClear,
      identify: mockIdentify,
      screenView: mockScreenView,
      track: mockTrack,
    };
  }),
}));

const ENV = {
  EXPO_PUBLIC_OPENPANEL_API_URL: "https://analytics.example/api",
  EXPO_PUBLIC_OPENPANEL_CLIENT_ID: "native-id",
  EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET: "native-secret",
};

/*
 * No `jest.isolateModules`: an isolated registry would hand `./analytics` its
 * own copy of the consent store, so `setConsent` below would change a store
 * the module under test never reads. One registry, and an explicit reset of
 * the lazy client, instead.
 */
const load = () => analytics;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetConsentForTests();
  analytics.resetAnalyticsForTests();
  await loadConsent();
  Object.assign(process.env, ENV);
});

afterEach(() => {
  for (const key of Object.keys(ENV)) {
    delete process.env[key];
  }
});

describe("mobile analytics", () => {
  it("sends nothing, and builds no client, before anyone has answered", () => {
    const { trackEvent } = load();
    trackEvent("gesture_viewed", { gesture_id: "1", source: "direct" });
    expect(mockConstructed).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("sends nothing after a refusal", async () => {
    await setConsent("denied");
    const { trackEvent } = load();
    trackEvent("gesture_viewed", { gesture_id: "1", source: "direct" });
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("sends an allowed event with platform native", async () => {
    await setConsent("granted");
    const { trackEvent } = load();
    trackEvent("gesture_viewed", { gesture_id: "1", source: "direct" });
    expect(mockTrack).toHaveBeenCalledWith("gesture_viewed", {
      gesture_id: "1",
      platform: "native",
      source: "direct",
    });
  });

  it("uses the native client's credentials, not the web pair", async () => {
    await setConsent("granted");
    const { trackEvent } = load();
    trackEvent("video_playback_completed", { gesture_id: "1" });
    expect(mockConstructed).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: ENV.EXPO_PUBLIC_OPENPANEL_API_URL,
        clientId: ENV.EXPO_PUBLIC_OPENPANEL_CLIENT_ID,
        clientSecret: ENV.EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET,
      })
    );
  });

  it("never identifies anyone, and names no account in any event (Review Focus 4)", async () => {
    await setConsent("granted");
    const { trackEvent, trackScreenView } = load();
    trackEvent("search_performed", {
      category_count: 0,
      has_results: true,
      query_length: 3,
      result_count: 2,
      source: "submit",
    });
    trackScreenView("/gestures/1");

    expect(mockIdentify).not.toHaveBeenCalled();
    expect(mockConstructed.mock.calls[0][0]).not.toHaveProperty("profileId");
    for (const [, properties] of [...track.mock.calls, ...screenView.mock.calls]) {
      expect(Object.keys(properties ?? {})).not.toEqual(
        expect.arrayContaining(["user_id", "userId", "profileId", "email"])
      );
    }
  });

  it("stops sending, and clears the client, the moment consent is withdrawn", async () => {
    await setConsent("granted");
    const { trackEvent } = load();
    trackEvent("video_playback_completed", { gesture_id: "1" });
    await setConsent("denied");
    trackEvent("video_playback_completed", { gesture_id: "2" });

    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockClear).toHaveBeenCalled();
  });

  it("is a silent no-op when the credentials are not configured", async () => {
    delete process.env.EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET;
    await setConsent("granted");
    const { trackEvent } = load();
    expect(() =>
      trackEvent("video_playback_completed", { gesture_id: "1" })
    ).not.toThrow();
    expect(mockConstructed).not.toHaveBeenCalled();
  });

  it("sends screen views through the SDK's own screenView", async () => {
    await setConsent("granted");
    const { trackScreenView } = load();
    trackScreenView("/search");
    expect(mockScreenView).toHaveBeenCalledWith("/search", { platform: "native" });
  });
});
```

Read `node_modules/@openpanel/react-native` (its `.d.ts`) before implementing: confirm the constructor option names (`apiUrl`, `clientId`, `clientSecret`, `filter`) and the method names (`track`, `screenView`, `clear`). If any differ, change both the implementation and the mock above to the real names. `apps/native/lib/openpanel.ts` is a working reference for the constructor.

- [ ] **Step 2: Run to see them fail**

Run: `bun -F mobile test -- src/lib/analytics.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/lib/analytics.ts
import { OpenPanel } from "@openpanel/react-native";
import type { AnalyticsEventMap, AnalyticsEventName } from "@smog/shared";
import { readConsent, subscribeConsent } from "@/lib/consent";

/**
 * Analytics, direct from the device to OpenPanel — as `apps/native` did, and
 * as the spec decided on 2026-09-22 — with two deliberate differences.
 *
 * **Nobody is identified.** `apps/native` called `identify` with the account
 * id. The privacy policy this app links to says events "are not linked to
 * your account, even when you are signed in", so there is no `identify`, no
 * `profileId`, and no account field in any property here.
 *
 * **The client is built lazily, only once consent is granted**, and every
 * send re-checks the store — the `filter` option too, so an event already
 * queued inside the SDK is dropped after a withdrawal. A client built at
 * module scope from an unset variable is dead on import (spec, same-named
 * section); built lazily, a missing variable is a silent no-op instead.
 *
 * The credentials are `EXPO_PUBLIC_*`, so they ship inside the bundle and
 * are extractable from any installed copy. That is why they belong to a
 * separate least-privileged native OpenPanel client, never the web pair.
 * They must be read as literal `process.env.EXPO_PUBLIC_…` expressions:
 * Expo inlines only those at build time.
 */
type Client = InstanceType<typeof OpenPanel>;

let client: Client | null = null;

function granted(): boolean {
  return readConsent() === "granted";
}

function getClient(): Client | null {
  if (!granted()) {
    return null;
  }
  if (client !== null) {
    return client;
  }
  const clientId = process.env.EXPO_PUBLIC_OPENPANEL_CLIENT_ID;
  const clientSecret = process.env.EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET;
  if (!(clientId && clientSecret)) {
    return null;
  }
  try {
    client = new OpenPanel({
      apiUrl:
        process.env.EXPO_PUBLIC_OPENPANEL_API_URL ??
        "https://analytics.zias.be/api",
      clientId,
      clientSecret,
      filter: () => granted(),
    });
  } catch (error) {
    console.error("[analytics] Failed to start OpenPanel:", error);
    client = null;
  }
  return client;
}

subscribeConsent(() => {
  if (!granted() && client !== null) {
    client.clear();
    client = null;
  }
});

export function trackEvent<E extends AnalyticsEventName>(
  name: E,
  properties: AnalyticsEventMap[E]
): void {
  try {
    getClient()?.track(name, { ...properties, platform: "native" });
  } catch (error) {
    console.error("[analytics] Failed to send event:", error);
  }
}

export function trackScreenView(path: string): void {
  try {
    getClient()?.screenView(path, { platform: "native" });
  } catch (error) {
    console.error("[analytics] Failed to send screen view:", error);
  }
}

/** Tests only. */
export function resetAnalyticsForTests(): void {
  client = null;
}
```

`resetAnalyticsForTests` is imported by the test, so knip sees a consumer. The `jest.mock` factory above is hoisted above the imports by babel-jest, so `./analytics` imports the mocked SDK; the factory may reference only out-of-scope variables whose names start with `mock`, which is why the spies are `mockTrack`, `mockClear` and so on.

Screen views, in `app/_layout.tsx`'s `Navigator`:

```tsx
import { usePathname } from "expo-router";
import { trackScreenView } from "@/lib/analytics";

// inside Navigator(), after useConsentSync():
const pathname = usePathname();
const { consent } = useConsent();
useEffect(() => {
  if (consent === "granted") {
    trackScreenView(pathname);
  }
}, [consent, pathname]);
```

(`consent` is in the dependency list so the screen someone is on when they tap "allow" is counted; `trackScreenView` re-checks consent itself, so the condition here only avoids a pointless call.)

- [ ] **Step 4: Run tests, typecheck, knip**

Run: `bun -F mobile test && bun -F mobile check-types && bunx knip --no-progress --no-config-hints`
Expected: all pass.

- [ ] **Step 5: Prove the identity test can fail**

Add `client.identify({ profileId: "x" })` right after construction in `getClient`. The Review Focus 4 test must FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/package.json bun.lock apps/mobile/src/lib/analytics.ts apps/mobile/src/lib/analytics.test.ts apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): OpenPanel on device, gated on consent, identifying nobody"
```

---

## Task 6: The five emitters

`apps/native`'s events, at their `apps/mobile` equivalents. No new events, no favourites emitter.

| Event | `apps/native` source | `apps/mobile` site | Properties |
|---|---|---|---|
| `screen_view` | `_layout.tsx:72-76` | done in Task 5 | — |
| `gesture_viewed` | `screens/GestureScreen.tsx:53` | `app/gestures/[id].tsx`, once per id, when the gesture has loaded | `{ gesture_id, source: "direct" }` |
| `video_playback_completed` | `GestureScreen.tsx:70` | `VideoPlayer`'s new `onPlaybackEnd`, passed from `app/gestures/[id].tsx` | `{ gesture_id }` |
| `search_performed` | `screens/SearchScreen.tsx:111` | `app/(tabs)/search.tsx`, once per settled query, when results arrive | `{ category_count: 0, has_results, query_length, result_count, source: "submit" }` |
| `gesture_collection_changed` | `context/ListsContext.tsx:193,248` | after `addToList` succeeds in `app/gestures/[id].tsx`; after `removeFromList` succeeds in `app/(tabs)/lists/[id].tsx` | `{ action: "added" \| "removed", collection: "list", gesture_id, source: "gesture_detail" \| "gesture_list" }` |

**Files:**
- Modify: `packages/ui-native/src/domain/VideoPlayer.tsx` (add `onPlaybackEnd?: () => void`)
- Modify: `packages/ui-native/src/test/expoVideoMock.tsx` (the mock player gains `addListener`, and tests can fire `playToEnd`)
- Modify: `packages/ui-native/src/domain/VideoPlayer.test.tsx`
- Modify: `apps/mobile/app/gestures/[id].tsx`, `apps/mobile/app/(tabs)/search.tsx`, `apps/mobile/app/(tabs)/lists/[id].tsx`
- Modify: the existing screen tests for those three routes under `apps/mobile/src/screens/` (find them with `grep -l "gestures/\[id\]\|tabs)/search\|lists/\[id\]" apps/mobile/src/screens/*.test.tsx`)

**Interfaces:**
- Consumes: Task 5's `trackEvent`.
- Produces: `VideoPlayerProps.onPlaybackEnd?: () => void`.

- [ ] **Step 1: `VideoPlayer` — failing test first**

Extend the mock so a test can end playback. In `expoVideoMock.tsx`, give the mock player a listener registry and export a helper:

```tsx
type Listener = () => void;
let lastPlayer: (ExpoVideoPlayerMock & { emit: (event: string) => void }) | null = null;

// inside useVideoPlayer, extend the object:
const listeners = new Map<string, Set<Listener>>();
const player = {
  loop: false,
  muted: false,
  pause: () => undefined,
  play: () => undefined,
  playing: false,
  addListener: (event: string, listener: Listener) => {
    const set = listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(event, set);
    return { remove: () => set.delete(listener) };
  },
  emit: (event: string) => {
    for (const listener of listeners.get(event) ?? []) listener();
  },
};
lastPlayer = player;

// module level:
/** Tests only: fire an expo-video event on the most recently created player. */
export function emitOnLastPlayer(event: string): void {
  lastPlayer?.emit(event);
}
```

(Add `addListener` to the `ExpoVideoPlayerMock` interface.) Note `useVideoPlayer` in the mock creates a new object every render; that matches how the real hook is *called*, and is fine for these tests.

Test, in `VideoPlayer.test.tsx`:

```tsx
import { emitOnLastPlayer } from "../test/expoVideoMock";

it("reports the end of playback once per end", () => {
  const onPlaybackEnd = jest.fn();
  render(<VideoPlayer onPlaybackEnd={onPlaybackEnd} playbackId="abc" title="Hallo" />);
  act(() => emitOnLastPlayer("playToEnd"));
  expect(onPlaybackEnd).toHaveBeenCalledTimes(1);
});

it("reports nothing when there is no video", () => {
  const onPlaybackEnd = jest.fn();
  render(<VideoPlayer onPlaybackEnd={onPlaybackEnd} playbackId={null} title="Hallo" />);
  act(() => emitOnLastPlayer("playToEnd"));
  expect(onPlaybackEnd).not.toHaveBeenCalled();
});
```

Run: `bun -F @smog/ui-native test -- VideoPlayer` → FAIL.

Implement in `VideoPlayer.tsx`. Confirm the event name `playToEnd` and the `addListener` signature against `node_modules/expo-video`'s type definitions first:

```tsx
// add to props: onPlaybackEnd?: () => void;
useEffect(() => {
  if (!(hasVideo && onPlaybackEnd)) {
    return;
  }
  const subscription = player.addListener("playToEnd", onPlaybackEnd);
  return () => subscription.remove();
}, [hasVideo, onPlaybackEnd, player]);
```

Run the package tests and typecheck → PASS.

- [ ] **Step 2: Emitter tests in the screen tests**

In each affected screen test file, add at the top:

```ts
jest.mock("@/lib/analytics", () => ({
  trackEvent: jest.fn(),
  trackScreenView: jest.fn(),
}));
import { trackEvent } from "@/lib/analytics";
```

and these cases (adapt fixture names to the file's existing helpers — every one of these files already stubs `fetch` for the gesture/list payloads):

- Gesture detail: after the gesture renders, `trackEvent` was called exactly once with `("gesture_viewed", { gesture_id: "<id>", source: "direct" })`; re-rendering with the same id does not call it again.
- Gesture detail: after a successful "add to list" (drive the existing add-to-list test path), `trackEvent` was called with `("gesture_collection_changed", { action: "added", collection: "list", gesture_id, source: "gesture_detail" })`; when the add request fails (stub a 500), it was **not**.
- Gesture detail: `emitOnLastPlayer("playToEnd")` (import from `@smog/ui-native`'s test mock path used by `apps/mobile/src/test/expoVideoMock.tsx` — mobile has its own copy; extend that copy identically in this task) → `("video_playback_completed", { gesture_id })`.
- Search: typing a query that returns 2 results → one `("search_performed", { category_count: 0, has_results: true, query_length: <n>, result_count: 2, source: "submit" })`; loading a second page or re-rendering does not fire again; a query returning 0 results fires with `has_results: false, result_count: 0`; a failed search fires nothing.
- List detail: a successful remove → `("gesture_collection_changed", { action: "removed", collection: "list", gesture_id, source: "gesture_list" })`; a failed remove → nothing.

Run the three files → FAIL.

- [ ] **Step 3: Implement the emitters**

Gesture detail (`app/gestures/[id].tsx`):

```tsx
import { trackEvent } from "@/lib/analytics";

// once per id, when loaded
useEffect(() => {
  if (gesture) {
    trackEvent("gesture_viewed", { gesture_id: id, source: "direct" });
  }
  // `gesture` identity changes on refetch; key on the id so a refetch of the
  // same gesture is not a second view.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [id, gesture !== undefined && gesture !== null]);

// on the VideoPlayer
onPlaybackEnd={() => trackEvent("video_playback_completed", { gesture_id: id })}

// right after `await addToList({ gestureId, id: listId });` succeeds
trackEvent("gesture_collection_changed", {
  action: "added",
  collection: "list",
  gesture_id: gestureId,
  source: "gesture_detail",
});
```

If Biome rejects the dependency array above, use a `useRef<string | null>` holding the last id reported and compare against it instead — the behaviour the test pins is "once per id".

Search (`app/(tabs)/search.tsx`): fire when a settled query's first page arrives, once per query string:

```tsx
import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

const reported = useRef<string | null>(null);
useEffect(() => {
  if (!enabled || loading || error || !data || reported.current === query) {
    return;
  }
  reported.current = query;
  trackEvent("search_performed", {
    category_count: 0,
    has_results: data.docs.length > 0,
    query_length: query.trim().length,
    result_count: data.totalDocs ?? data.docs.length,
    source: "submit",
  });
}, [data, enabled, error, loading, query]);
```

Check the shape `useGestures` returns (`src/data/gestures.ts`) for `totalDocs`; if it has none, use `data.docs.length` and drop the fallback.

List detail (`app/(tabs)/lists/[id].tsx`): right after `await removeFromList({ gestureId, id: list.id });` succeeds, emit `{ action: "removed", collection: "list", gesture_id: gestureId, source: "gesture_list" }`.

- [ ] **Step 4: Run everything**

Run: `bun -F @smog/ui-native test && bun -F mobile test && bun -F mobile check-types && bun -F @smog/ui-native check-types && bunx knip --no-progress --no-config-hints`
Expected: all pass.

- [ ] **Step 5: Prove two emitters can fail**

Move the `gesture_collection_changed` call in the gesture detail to *before* `await addToList(...)`: the "failed add fires nothing" test must FAIL. Remove the `reported.current === query` guard in search: the "does not fire again" test must FAIL. Restore both.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-native apps/mobile/app apps/mobile/src
git commit -m "feat(mobile): emit apps/native's five events, and nothing more"
```

---

## Task 7: Changing your mind in Settings

The banner disappears once answered, so — exactly as Stage 8.5 found on the web — without a control elsewhere the first answer is final. Settings gets the switch and the policy link, for guests and signed-in people alike.

**Files:**
- Modify: `apps/mobile/app/(tabs)/settings/index.tsx`
- Modify: `apps/mobile/src/screens/settings.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`useConsent`, `setConsent`), Task 3 (`privacyPolicyUrl`), `Switch`, `Card`, `Text` from `@smog/ui-native`.

- [ ] **Step 1: Failing tests** (append to `settings.test.tsx`; it already mocks `expo-web-browser`, `expo-router` and `expo-secure-store`)

```tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ANALYTICS_CONSENT_KEY, readConsent, resetConsentForTests } from "@/lib/consent";

describe("the analytics control", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetConsentForTests();
  });

  it("is off for someone who has not answered, and turning it on grants", async () => {
    renderScreen();
    const toggle = await screen.findByLabelText(/analytics/i);
    expect(toggle.props.value).toBe(false);
    fireEvent(toggle, "valueChange", true);
    await waitFor(() => expect(readConsent()).toBe("granted"));
  });

  it("lets someone who allowed analytics withdraw — a refusal, not a blank", async () => {
    await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    renderScreen();
    const toggle = await screen.findByLabelText(/analytics/i);
    await waitFor(() => expect(toggle.props.value).toBe(true));
    fireEvent(toggle, "valueChange", false);
    await waitFor(() => expect(readConsent()).toBe("denied"));
  });

  it("works without an account", async () => {
    renderScreen(); // no token in SecureStore: signed out
    expect(await screen.findByLabelText(/analytics/i)).toBeTruthy();
  });

  it("opens the privacy policy in the current locale", async () => {
    setLocale("en");
    renderScreen();
    fireEvent.press(await screen.findByTestId("settings-privacy"));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      expect.stringMatching(/\/en\/privacy$/)
    );
  });
});
```

The `/analytics/i` matcher assumes `settings.analyticsTitle` contains "analytics" in `nl`/`en`; read the JSON and use a matcher that fits the actual string of the locale the test renders in.

Run → FAIL.

- [ ] **Step 2: Implement**

Add a Card after the theme row, in the file's existing Card style:

```tsx
function AnalyticsRow() {
  const { consent } = useConsent();
  const { locale } = useLocale();

  return (
    <Card className="gap-sm">
      <View className="flex-row items-center justify-between gap-md">
        <View className="flex-1">
          <Text variant="heading">{t("settings.analyticsTitle")}</Text>
          <Text variant="muted">{t("settings.analyticsDescription")}</Text>
        </View>
        <Switch
          label={t("settings.analyticsTitle")}
          onValueChange={(next) => setConsent(next ? "granted" : "denied")}
          value={consent === "granted"}
        />
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() => openBrowserAsync(privacyPolicyUrl(locale))}
        testID="settings-privacy"
      >
        <Text className="underline">{t("settings.privacyPolicy")}</Text>
      </Pressable>
    </Card>
  );
}
```

Match the file's existing imports and `Card`/`Text` usage (read `LanguageRow` and `ThemeRow` first and copy their structure, not the snippet's, where they differ).

- [ ] **Step 3: Run, typecheck, knip** → all pass.

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/app/(tabs)/settings/index.tsx" apps/mobile/src/screens/settings.test.tsx
git commit -m "feat(mobile): withdraw or grant analytics from Settings"
```

---

## Task 8: Exit

- [ ] **Step 1: The whole gate.** Run `bun release:check` from the root. `expo-doctor` may fail locally on its network checks (AGENTS.md); if it does, run every other step of the gate individually and record which failed and why.
- [ ] **Step 2: Prove the credentials inline and the SDK ships.** A jest test cannot show what Metro does (spec: "A style gate that only runs under the test runner proves only the test runner"). Run, from `apps/mobile`:

```bash
EXPO_PUBLIC_OPENPANEL_CLIENT_ID=probe-id-8f3a EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET=probe-secret-8f3a \
  bunx expo export --platform android --output-dir /tmp/stage86-export
grep -rl "probe-id-8f3a" /tmp/stage86-export | head -1   # expect a match
grep -rl "@smog_analytics_consent" /tmp/stage86-export | head -1   # expect NO match
```

Then export again **without** the two variables and confirm the probe strings are absent. Record both results. (Probe values only — never real credentials.)
- [ ] **Step 3: Deployment checklist.** Fill the "Mobile analytics (Stage 8.6)" section of `docs/deployment-checklist.md`: the three `EXPO_PUBLIC_OPENPANEL_*` names, that they are build-time and public, the command this repo uses to set EAS build variables (check `apps/mobile/eas.json` and the `eas-cli` version; if there is no EAS config, say they are read from the build environment by `expo export`/`eas build` and name that as an open item), and what happens without them (analytics silently off; consent prompt and consent rows unaffected).
- [ ] **Step 4: Record the exit** in this plan, one section per Review Focus line with the test that pins it, plus the two export results.
- [ ] **Step 5: Update `docs/superpowers/plans/README.md`**: Stage 8.6 landed; Stage 9 next.
- [ ] **Step 6: Commit and push.**

## Stage 8.6 exit criteria

1. A person who has never answered sees a non-blocking prompt on first launch; nothing on the screen is covered by it.
2. Their answer is stored as `"granted"` or `"denied"`, never as a missing value, and survives a restart.
3. A signed-in person's decision produces exactly one consent row per change, retried after a failure.
4. Signing out drops an account-attributed decision.
5. No event is sent without `"granted"`; withdrawal stops sending immediately.
6. No account identity reaches OpenPanel.
7. Exactly `apps/native`'s five events are emitted.
8. Settings offers withdrawal and the policy link to guests and signed-in people alike.
9. `bun release:check` green (modulo documented sandbox `expo-doctor` network failures); export proofs recorded.

---

## Stage 8.6 exit: measured

### Review Focus, by pinning test

1. **Two reconcile passes in flight at once.** Pinned by
   `apps/mobile/src/lib/consentSync.test.ts`, `"serialises passes: two at
   once send one request (Review Focus 1)"`.
2. **The prompt flashing before the stored decision loads.** Pinned by
   `apps/mobile/src/lib/consent.test.ts`, `"reports not-loaded before the
   first read resolves (Review Focus 2)"`, and by
   `apps/mobile/src/components/ConsentBanner.test.tsx`, `"does not render at
   all before the stored answer has loaded (Review Focus 2)"`.
3. **Signing out on a device whose decision was recorded for an account.**
   Pinned by `apps/mobile/src/lib/consentSync.test.ts`, `"drops an
   attributed decision on sign-out, so the next person is asked (Review
   Focus 3)"` (plus its two neighbours covering a still-pending marker and a
   different account's marker, and the fix-round tests `"keeps a confirmed
   decision when the session could not be verified, rather than treating it
   as signed out"` / `"keeps a pending decision when the session could not
   be verified, and still retries it once verified again"`, which pin the
   ruling that only an absent token — not an unresolved one — means
   sign-out).
4. **Account identity leaking into analytics.** Pinned by
   `apps/mobile/src/lib/analytics.test.ts`, `"never identifies anyone, and
   names no account in any event (Review Focus 4)"`.
5. **The consent POST failing — offline, 429, 5xx.** Pinned by
   `apps/mobile/src/lib/consentSync.test.ts`, the `it.each([429, 500,
   503])("keeps a %s pending and retries on the next pass (Review Focus
   5)")` cases, `"keeps an offline attempt pending too"`, and
   `useConsentSync`'s foreground-retry path is pinned by `"retries a pending
   decision when the app returns to the foreground (Review Focus 5)"`.

### Exit criteria, by verification

1. **Non-blocking prompt, covers nothing.** `Banner` renders in layout flow
   below the navigator, not as a `Modal`/scrim — pinned by
   `packages/ui-native/src/components/Banner.test.tsx`, `"is not a modal:
   nothing in its tree is an RN Modal"`, and the `Navigator` in
   `apps/mobile/app/_layout.tsx` mounts it *after* the `Stack`, in flow, with
   the bottom inset handed to the banner while it is visible. Shown only to
   someone who has never answered: `ConsentBanner.test.tsx`, `"asks someone
   who has never answered"`.
2. **Tri-state, never a missing value, survives a restart.** `consent.ts`'s
   `ConsentState` is `"granted" | "denied" | null`; `setConsent` only
   accepts the two decided values, so nothing ever writes an empty string.
   Persistence across a fresh module load is pinned by `consent.test.ts`,
   `"reads back a stored decision"` and `"clears back to undecided"`; the
   fresh-module flash guard is pinned by `"has not loaded before anything
   has asked it to"` (`describe("the flash guard, on a fresh module
   instance")`).
3. **Exactly one consent row per change, retried after failure.** Pinned by
   `consentSync.test.ts`, `"does not send the same decision twice"`, `"sends
   again when the decision changes"`, and the Review Focus 5 retry cases
   above.
4. **Signing out drops an account-attributed decision.** Pinned by Review
   Focus 3's tests above, including the pending-marker variant
   `"drops a pending decision on sign-out as well — the next person must not
   inherit it"`.
5. **No event without `"granted"`; withdrawal stops sending immediately.**
   Pinned by `analytics.test.ts`, `"sends nothing, and builds no client,
   before anyone has answered"`, `"sends nothing after a refusal"`, and
   `"stops sending, and clears the client, the moment consent is
   withdrawn"`.
6. **No account identity reaches OpenPanel.** Pinned by Review Focus 4's
   test at the jest layer; confirmed independently at the bundle layer in
   Step 2 below — no `.identify(` call site exists anywhere in the exported
   JS.
7. **Exactly `apps/native`'s five events.** `gesture_viewed`,
   `video_playback_completed`, `search_performed`,
   `gesture_collection_changed` (×2 call sites: added in
   `app/gestures/[id].tsx`, removed in `app/(tabs)/lists/[id].tsx`), and
   `screen_view` via `trackScreenView` in `app/_layout.tsx` — confirmed by
   grepping every non-test `trackEvent(`/`trackScreenView(` call site in
   `apps/mobile/app` and `apps/mobile/src`; no sixth event, no favourites
   emitter.
8. **Settings offers withdrawal and the policy link to guests and signed-in
   people alike.** Pinned by `apps/mobile/src/screens/settings.test.tsx`,
   `describe("the analytics control")`: `"is off for someone who has not
   answered, and turning it on grants"`, `"lets someone who allowed
   analytics withdraw — a refusal, not a blank"`, `"works without an
   account"`, `"opens the privacy policy in the current locale"`, and the
   Task 7 ruling's own test `"disables the switch until the stored answer
   has loaded"`.
9. **`bun release:check` and export proofs.** See below.

### Step 1: the whole gate

`bun release:check` was run whole from the root twice, then every step was
also run individually once the two environment issues below were
identified and isolated:

- **`site#check-types` failed** on the first whole run:
  `.open-next/server-functions/default/apps/site/handler.mjs(5228,903):
  error TS1111: Private field '#d' must be declared in an enclosing class.`
  (and three more at the same two positions). Cause, confirmed by
  experiment: a **stale `apps/site/.open-next` build directory** already
  present in this sandbox from before this session (dated well before this
  run), pulled into `tsc`'s module resolution via `cloudflare-env.d.ts`'s
  generated `typeof import("./.open-next/worker")` (site's `tsconfig.json`
  excludes `.open-next` from its own globs, but `tsc` still follows an
  explicit `import` into an excluded directory to resolve its type). `bun
  -F site check-types`'s own task has no dependency on `build`, so a clean
  CI checkout never has this directory at `check-types` time; a real
  regression would reproduce with the directory absent. It did not:
  **moving `.open-next` aside made `bun -F site check-types` pass cleanly**
  (no output, exit 0), confirming this was the stale artifact, not a
  Stage 8.6 regression (Stage 8.6 never touches `apps/site`).
- **`mobile#test` (then `site#test`) failed once each** across the two
  whole runs, always under `turbo test`'s full 18-package concurrency —
  never the same package twice, and never reproducing standalone. The
  mobile run failed on `src/screens/listDetail.test.tsx` (a `waitFor`
  timeout inside its own 15s per-test cap, at 25.6s wall time) and
  `src/screens/gestureDetail.test.tsx` (`"reports playback completion when
  the video ends"`, 0 calls) with `console.error` "not wrapped in act(...)"
  noise alongside; the site run failed on
  `src/jobs/schedules.int.test.ts`'s fault-injection case ("the stats
  global is on fire") and reported a `D1_ERROR: network is unreachable`
  elsewhere in the same run. This matches the pattern Task 6 already
  documented in the SDD ledger (`progress.md`, "CI red on 2594e36... a
  pre-existing CPU/cold-transform-cache slowness... release-check runs
  every package suite concurrently via turbo") — this sandbox is
  resource-constrained for the full concurrent run, not the code.
  Confirmed by re-running each implicated suite alone:
  - `bun -F mobile test` (whole package, not just the two files): **245
    passed, 245 total, 24 suites** — including both previously-flaked
    files and the specific "reports playback completion when the video
    ends" case.
  - `bun -F site test -- src/jobs/schedules.int.test.ts`: **7 passed, 7
    total**.
  - `bun -F site test` (whole package, standalone): **125 of 126 files,
    1643 of 1644 tests passed**; the one file that still failed standalone
    (a different flake than the whole-run one) was re-run alone
    immediately after and passed, consistent with the same
    resource-contention pattern rather than a deterministic failure.

Every other step, run individually from the root/relevant package:

| Step | Command | Result |
|---|---|---|
| `check:ci` | `bun run check:ci` | Pass — Biome, 898 files, no fixes needed |
| `release:config-check` | `bun run release:config-check` | Pass |
| `check-types` | `bun run check-types` (after clearing the stale `.open-next`) | Pass, all 18 packages |
| `test` | see above | Pass per-package once run outside full-concurrency contention |
| `bun audit --production` | `bun audit --production` | Pass — "No vulnerabilities found" |
| `native:release-check` — expo-doctor | `bunx expo-doctor apps/native` / `apps/mobile` | **Fails identically for both apps**, both times on the same two network-dependent checks: `SyntaxError: Unexpected token 'H', "Host not i"... is not valid JSON` (Check Expo config schema) and `Directory check failed with unexpected server response` (React Native Directory). Matches AGENTS.md's documented sandbox limitation exactly (17/19 checks pass otherwise). |
| `native:release-check` — exports | `bun -F native export`, `bun -F mobile export` | Both pass, exit 0 |
| `native:release-check` — size print | `du -sk apps/mobile/dist` | 17,068 KB ≈ 16.67 MiB |
| `build` | `bun run build` | Pass — 4 tasks successful (site `next build`, others cached) |
| `knip` | `bunx knip --no-progress --no-config-hints` | Pass — no output, no findings |

**Verdict:** every step passes on its own merits; the only non-sandbox-network
failures seen were transient full-concurrency resource contention that did
not reproduce when the same suite ran without competing against the other
17 packages, and a stale pre-existing local build artifact unrelated to
this stage's changes. No Stage 8.6 code defect was found.

### Step 2: credentials inline, SDK ships (export proofs)

Run from `apps/mobile`. **Caveat found and corrected:** the first attempt
(`--platform android`, no `--clear`) produced a bundle whose content hash
matched a bundle built earlier in this session *without* the probe
variables — Metro's transform cache does not key on `EXPO_PUBLIC_*` values,
so a stale cache silently serves the previous build. Every export below
was re-run with `--clear` once this was noticed; all results below are from
cache-cleared exports (hbc for the literal command in the brief; a web
export alongside it, whose plain-JS output is directly greppable, to read
the actual surrounding code rather than guess at Hermes's bytecode string
table).

**With the probe credentials** (`EXPO_PUBLIC_OPENPANEL_CLIENT_ID=probe-id-8f3a
EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET=probe-secret-8f3a bunx expo export
--platform android --clear --output-dir …`):

- `probe-id-8f3a` and `probe-secret-8f3a`: **present**, once each, in the
  `.hbc` bundle (byte search) and, readably, in the web bundle:
  `clientId:"probe-id-8f3a",clientSecret:"probe-secret-8f3a"` inside the
  compiled `getClient()` — confirms `EXPO_PUBLIC_*` is inlined at build
  time exactly as `analytics.ts`'s comment claims.
- `smog.consent.analytics` / `smog.consent.synced`: **present** (our own
  storage keys, expected).
- `@smog_analytics_consent` (the legacy key, substring
  `smog_analytics_consent`): **present** — but not because anything reads
  or writes it. Traced with `python3` byte-offset inspection to
  `packages/config/src/constants.ts`'s `ANALYTICS_CONSENT_STORAGE_KEY`
  constant. `packages/config/src/index.ts`'s barrel re-exports it (`export
  * from "./constants"`, alongside `./sponsorships` and `./urls`), and
  `packages/ui-native/src/domain/StatusBadge.tsx` imports from that same
  barrel — `SPONSORSHIP_STATUS_LABELS` and `type SponsorshipStatus`, both
  actually defined in `packages/config/src/sponsorships.ts`, not
  `constants.ts`. Nothing in the repo imports `constants.ts`'s
  `SQLITE_DATABASE_NAME` or `DATABASE_TARGET_VERSION` either (grepped) —
  they, and `ANALYTICS_CONSENT_STORAGE_KEY`, ship purely because importing
  anything from the `@smog/config` barrel pulls in every module it
  re-exports wholesale. Metro bundles a required CommonJS/ESM module as a
  whole file — it does not tree-shake individual unused named exports the
  way Rollup/webpack can — so `constants.ts` ships in full, including this
  one string nothing ever reads. `apps/mobile` has zero imports of
  `ANALYTICS_CONSENT_STORAGE_KEY` (grepped) and `consent.ts` never reads or
  writes `AsyncStorage` under that key — confirmed both by source
  inspection and by `consent.test.ts`'s `"never reads the legacy apps/native
  key"`. This is a bundling-granularity artifact of a shared constants
  file, not a runtime leak; recorded here rather than silently reported as
  "no match" since the brief asked to report findings, not the expected
  answer.
- `.identify(`: **zero call sites** anywhere in the web bundle (checked
  with a regex over the whole file). The `OpenPanel` class itself defines
  the method (it's a general-purpose SDK), but nothing in `analytics.ts`'s
  compiled output — the only place the client is constructed or used —
  calls it. Independent bundle-level confirmation of exit criterion 6 and
  Review Focus 4.

**Without the two variables** (same command, unset, `--clear`):

- `probe-id-8f3a` / `probe-secret-8f3a`: **absent** (0 occurrences),
  confirmed on both the `.hbc` (byte count) and the web bundle (`grep -c`).
- The web bundle's minifier statically eliminated the entire
  `new OpenPanel(...)` construction: with `process.env.EXPO_PUBLIC_
  OPENPANEL_CLIENT_ID`/`_CLIENT_SECRET` both inlined to the literal
  `undefined`, the `if (!(clientId && clientSecret)) return null;` guard is
  always true, and the minifier reduced `getClient` to `function
  c(){if(!l())return null;if(null!==t)return t;return null}` — no
  `clientId:`/`clientSecret:` construction text remains at all. A stronger
  form of the documented "silent no-op" than the source comment claims:
  build-time elimination, not just a runtime null return.

### Carried out of Stage 8.6

Not fixed here — for the final whole-branch review to triage (from the SDD
ledger, `progress.md`):

- Task 1: the `type ConsentState` import in `consent.test.ts` existed to
  satisfy knip until a later task consumed it (it now also serves the
  test's own assertion at line 34, so this is effectively resolved, but is
  listed as the ledger recorded it).
- Task 1: no test that unsubscribe stops notifications, or that
  `clearConsent` notifies.
- Task 2: `Banner.tsx` hardcodes `16` rather than `tokens.spacing.md`
  (plan-mandated literal).
- Task 2: `BannerProps`' rest spread lands after `role`/`accessibilityLabel`,
  so a caller can override the labelled-region contract (same pattern as
  `ui-web`'s `Banner`).
- Task 3: testIDs `consent-allow` / `consent-required-only` are unasserted.
- Task 4: a provisional-marker write failure skips the POST where the web
  still POSTs; no read-back of the marker (plan-mandated, undocumented
  difference from the web).
- Task 4: `run` (inside `useConsentSync`) drops `reconcileConsent`'s
  promise (a floating promise).
- Task 4: the "settles rather than looping" test has no subscriber
  attached, so it cannot actually detect a loop.
- Task 4: listener removal on unmount is untested (the `AppState` spy
  returns a stub).
- Task 4: `console.error` is silenced suite-wide in `consentSync.test.ts`,
  which may hide `act()` warnings.
- Task 4: `resolveSessionUser` reads the token once but sends `/users/me`
  with `auth: true` (a second keychain read), so the verified pair could
  in principle combine two tokens' facts if the keychain changes between
  reads; blocks only in practice. Fix noted: send the already-read token
  explicitly.
- Task 4 (pre-existing, out-of-scope): `payloadFetch` clears the token on
  *any* 401 regardless of which token the request carried; `SessionProvider`
  has no sequence guard across overlapping `load()` calls (a slow old
  resolve can render the wrong user briefly; the consent gate still
  blocks).
- Task 5: `analytics.ts`'s comment overclaims what `filter` does — no
  `storage`/`networkInfo` is passed to the SDK, so it never queues, and
  `filter` is redundant with the lazy-client gate today; re-verify if
  storage is ever added.
- Task 5: the constructor's `catch` path is untested.
- Task 6: the inline `onPlaybackEnd` arrow resubscribes the `playToEnd`
  listener every render (harmless churn).
- Task 6: `search.tsx`'s comment says the dedup is keyed on data identity;
  it is actually keyed on the query string plus a reported flag.
- Task 7: `AnalyticsRow`'s `Switch` falls back to `testID="root"`.
