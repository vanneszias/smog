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
type ConsentChoice = "denied" | "granted";

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
 * Subscribe to changes, in this tab and — unless asked otherwise — in every
 * other one.
 *
 * The `storage` event fires in every tab EXCEPT the one that wrote, so both
 * halves are needed: `notify()` covers this tab, the listener covers the
 * others. A store with only the first keeps a second tab tracking after a
 * refusal, and no single-tab test would ever show it.
 *
 * ## Why `crossTab: false` exists, and who wants it
 *
 * That argument is about *display*: a banner and a switch must both tell the
 * truth in every open tab, so they take the default. It is the wrong rule for
 * a subscriber that *acts* on the change. `components/ConsentSync.tsx` posts a
 * row, and the tab that made the decision is already posting one — so a
 * second tab woken by `storage` writes a duplicate into a table nothing can
 * prune, and a tab rendered before sign-in wakes with a stale `userId` and
 * clears the answer the other tab has just taken. Every document runs its own
 * reconciler on mount, so nothing is missed by declining to act on somebody
 * else's write; only the duplicate is.
 *
 * Shaped for `useSyncExternalStore`: subscribe returns its own unsubscribe.
 */
export function subscribeConsent(
  listener: () => void,
  options: { crossTab?: boolean } = {}
): () => void {
  listeners.add(listener);

  const crossTab = options.crossTab !== false;

  const onStorage = (event: StorageEvent) => {
    if (event.key === ANALYTICS_CONSENT_KEY) {
      listener();
    }
  };

  if (crossTab && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    listeners.delete(listener);

    if (crossTab && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}
