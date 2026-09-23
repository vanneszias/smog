import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_CONSENT_KEY, writeConsent } from "@/lib/consentStore";
import { ConsentSync } from "./ConsentSync";

/*
 * `createRoot` + React's own `act`, not `@testing-library/react` —
 * `apps/site` has no such dependency, and adding one would fail `knip`. See
 * `GuestFavoritesSync.test.tsx` for the same note.
 */
let container: HTMLDivElement;
let root: Root;

const SYNCED_KEY = "smog.consent.synced";

describe("ConsentSync", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  const mount = async (userId: null | number | string = 1) => {
    await act(async () => {
      root.render(<ConsentSync userId={userId} />);
    });
  };

  const okResponse = () =>
    new Response(JSON.stringify({ analyticsConsent: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  const markerFor = (userId: string, value: string) =>
    window.localStorage.setItem(SYNCED_KEY, JSON.stringify({ userId, value }));

  /**
   * What another tab's write looks like from in here.
   *
   * `storage` fires in every document *except* the one that wrote, so a
   * second tab is exactly a direct `localStorage` write that this document
   * was not notified of, followed by this event. Using `writeConsent` here
   * instead would call `notify()` in this document and simulate nothing.
   */
  const fromAnotherTab = async (consent: string) => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, consent);

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: ANALYTICS_CONSENT_KEY })
      );
    });
  };

  /** A second page load in the same browser: unmount, then mount again. */
  const reload = async (userId: null | number | string) => {
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await mount(userId);
  };

  it("renders nothing at all", async () => {
    await mount();
    expect(container.innerHTML).toBe("");
  });

  it("adds nothing to the server-rendered markup either", () => {
    expect(renderToStaticMarkup(<ConsentSync userId={1} />)).toBe("");
  });

  it("makes no request when the visitor has not decided yet", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await mount();

    // `readConsent()` is `null` here — the undecided case, and the ordinary
    // one for a visitor who has never seen the banner answer.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a granted decision on the first signed-in page", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse());

    await mount();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/consent");
    expect(JSON.parse(String(init?.body))).toEqual({ analyticsConsent: true });
  });

  it("posts a refusal too, not only an acceptance", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "denied");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse());

    await mount();

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      analyticsConsent: false,
    });
  });

  it("marks the sync with the account it was made for", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

    await mount(7);

    expect(window.localStorage.getItem(SYNCED_KEY)).toBe(
      JSON.stringify({ userId: "7", value: "granted" })
    );
  });

  /*
   * The idempotence property the whole design rests on. Two signed-in page
   * loads are two mounts of this component in the same browser, and the
   * normal case is that nothing changed between them — a reconciler that
   * posted on every mount would turn `user-consents` into a page-view log.
   */
  it("loading two signed-in pages produces exactly one row", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse());

    await mount();
    await act(async () => {
      root.unmount();
    });

    root = createRoot(container);
    await mount();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on the next page load when the POST is refused", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "signed-out" }), {
        headers: { "Content-Type": "application/json" },
        status: 401,
      })
    );

    await mount();
    await act(async () => {
      root.unmount();
    });

    root = createRoot(container);
    fetchMock.mockResolvedValue(okResponse());
    await mount();

    // The marker was never set on the failed attempt, so the second mount
    // — the retry — still posts. This is what "the irreversible step last"
    // buys: a partial failure is retryable rather than silently accepted.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("syncs again when the decision changes between page loads", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse());

    await mount();
    await act(async () => {
      root.unmount();
    });

    // A changed mind between two page loads — the account page's own toggle
    // writes the store directly, and this reconciler must not skip it.
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "denied");
    root = createRoot(container);
    await mount();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondInit] = fetchMock.mock.calls[1];
    expect(JSON.parse(String(secondInit?.body))).toEqual({
      analyticsConsent: false,
    });
  });

  it("does not throw out of the effect when the POST fails outright", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    vi.spyOn(console, "error").mockImplementation(() => {
      // The failure is logged by `postConsent`; silenced, not asserted.
    });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await expect(mount()).resolves.toBeUndefined();
    expect(container.innerHTML).toBe("");
  });

  /*
   * The account rule: the shared/library computer walkthrough. Account 1
   * granted and its marker is on record; account 2 signs in on the same
   * browser. `localStorage` still says "granted" — that is account 1's answer,
   * not account 2's — and the realistic bug is treating it as already
   * reconciled (or worse, syncing it as if account 2 had said so). Neither may
   * happen: the browser's decision must be cleared, and nothing posted, so the
   * banner asks account 2 for themselves.
   */
  describe("when the marker names a different account", () => {
    it("clears the browser's decision instead of syncing it to the new account", async () => {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
      markerFor("1", "granted");
      const fetchMock = vi.spyOn(globalThis, "fetch");

      await mount(2);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("leaves the banner's undecided state as the result", async () => {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
      markerFor("1", "granted");

      await mount(2);

      expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBeNull();
    });

    it("does not fabricate a row for the new account from the old marker's value", async () => {
      // The tempting-but-wrong fix, spelled out as a negative assertion:
      // keying the marker by user id and falling through to "not yet
      // synced" would make this mount POST `granted` under account 2 — a
      // decision account 2 never made. This must not happen either.
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
      markerFor("1", "granted");
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(okResponse());

      await mount(2);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does the same for a refusal, not only for a grant", async () => {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "denied");
      markerFor("1", "denied");
      const fetchMock = vi.spyOn(globalThis, "fetch");

      await mount(2);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBeNull();
    });

    /*
     * **Steps 3 and 4, which the four cases above all stop short of.** They
     * prove the mismatch is detected once; they cannot see what happens
     * after account 2 answers, because none of them lets account 2 answer.
     * That is where the real defect lived: clearing the decision without
     * clearing the marker leaves the marker naming account 1 for ever, so
     * account 2's own answer is wiped again on every later page load and
     * account 2 is asked, and re-asked, and never recorded.
     */
    it("keeps the new account's own answer instead of wiping it on the next page load", async () => {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
      markerFor("1", "granted");
      vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

      // Step 2: account 2 signs in, and account 1's answer is cleared.
      await mount(2);
      expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBeNull();

      // Step 3: account 2 answers the banner for themselves.
      await act(async () => {
        writeConsent("denied");
      });

      // Step 4: the next page load must still find account 2's own answer.
      await reload(2);

      expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("denied");
    });

    it("records the new account's refusal, once, rather than never", async () => {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
      markerFor("1", "granted");
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(okResponse());

      await mount(2);
      await act(async () => {
        writeConsent("denied");
      });
      await reload(2);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(String(init?.body))).toEqual({
        analyticsConsent: false,
      });
      expect(window.localStorage.getItem(SYNCED_KEY)).toBe(
        JSON.stringify({ userId: "2", value: "denied" })
      );
    });
  });

  /*
   * The answer has to reach the server when it is given, not on whatever
   * later page load happens to come next. A visitor who declines on the
   * landing page and closes the tab leaves no evidence of the refusal
   * otherwise — and a refusal that is not recorded is, in this table, the
   * same as never having been asked.
   */
  describe("when the decision is made on the page this is already mounted on", () => {
    it("records it there and then, without waiting for another page load", async () => {
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(okResponse());

      await mount(3);
      expect(fetchMock).not.toHaveBeenCalled();

      await act(async () => {
        writeConsent("denied");
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(String(init?.body))).toEqual({
        analyticsConsent: false,
      });
    });

    it("does not record it twice when the next page load comes anyway", async () => {
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(okResponse());

      await mount(3);
      await act(async () => {
        writeConsent("granted");
      });
      await reload(3);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  /*
   * Failure mode 1, on the path the account rule left uncovered. The account
   * rule reasoned about account A followed by account B; A followed by *nobody*
   * is the same shared machine with the same consequence — the next person is
   * tracked on A's "granted" without ever being asked — and it is the more
   * common half, because signing out is a thing people do on purpose.
   */
  describe("when nobody is signed in", () => {
    it("does not leave the previous account's decision for the next visitor", async () => {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
      markerFor("1", "granted");
      const fetchMock = vi.spyOn(globalThis, "fetch");

      await mount(null);

      expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBeNull();
      expect(window.localStorage.getItem(SYNCED_KEY)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("leaves a guest's own answer alone, because no account ever synced here", async () => {
      /*
       * The opposite mistake, and the reason the signal is the *marker*
       * rather than the session: a guest who answered the banner and never
       * signed in has made a decision of their own. Clearing on every
       * signed-out load would ask them again on every page, for ever, and
       * would post nothing for anyone.
       */
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
      const fetchMock = vi.spyOn(globalThis, "fetch");

      await mount(null);

      expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe(
        "granted"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("asks the next visitor rather than posting the old answer when they sign in", async () => {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
      markerFor("1", "granted");
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(okResponse());

      await mount(null);
      await reload(2);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBeNull();
    });
  });

  /*
   * **The gap the first fix did not close.** The signed-out branch
   * keys on the marker being present, and the marker was written only after
   * a 200 — so "a decision made while signed in whose POST never landed" was
   * byte-identical to "a guest's own decision". Both of the named failure
   * modes fall out of that: the next guest is tracked on it, and the next
   * account has a row written from it. `POST /api/consent` acquired a rate
   * limiter at the same time, which put a fresh, ordinary route into it
   * — a 429 on the first post for that account on that browser lands exactly
   * here.
   */
  describe("when a signed-in decision never reached the server", () => {
    const refuseThePost = () =>
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: "Too many requests" }), {
          headers: { "Content-Type": "application/json" },
          status: 429,
        })
      );

    it("does not leave it behind for the next guest", async () => {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
      const fetchMock = refuseThePost();

      await mount(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // The visitor signs out. This was account 1's answer, not this
      // browser's guest's, and the next person must be asked.
      await reload(null);

      expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBeNull();
      expect(window.localStorage.getItem(SYNCED_KEY)).toBeNull();
    });

    it("is not recorded under the next account either", async () => {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
      const fetchMock = refuseThePost();

      await mount(1);
      await reload(2);

      // One attempt, for account 1. Nothing fabricated for account 2 — the
      // outcome the account rule calls the worst of the three it weighed.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBeNull();
    });

    /*
     * The property a provisional marker is most likely to break, so it is
     * pinned rather than assumed: the limiter delays a record, it does not
     * drop one. A marker that suppressed the retry would turn every 429 into
     * a silently unrecorded decision.
     */
    it("is still retried for the account that made it", async () => {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
      const fetchMock = refuseThePost();

      await mount(1);
      fetchMock.mockResolvedValue(okResponse());
      await reload(1);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(window.localStorage.getItem(SYNCED_KEY)).toBe(
        JSON.stringify({ userId: "1", value: "granted" })
      );
    });
  });

  /*
   * `subscribeConsent` fires on cross-tab `storage` events as well as on
   * this document's own writes, which is right for a banner and wrong for a
   * reconciler: the other tab has a reconciler of its own, already posting.
   * Two tabs, one toggle, two permanent rows — the same "two writers, one
   * toggle" argument that took the POST out of `AccountConsentControl`,
   * surviving across documents.
   */
  describe("when another tab is the one that acts", () => {
    it("does not post a decision the tab that made it is already posting", async () => {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "denied");
      markerFor("1", "denied");
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(okResponse());

      await mount(1);
      expect(fetchMock).not.toHaveBeenCalled();

      await fromAnotherTab("granted");

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not let a tab rendered before sign-in wipe what a signed-in tab just decided", async () => {
      /*
       * A page opened while signed out still has `userId === null` in its
       * props for as long as it stays open. Woken by another tab's write it
       * would find a marker, call it a decision with nobody to own it, and
       * clear the answer the visitor had just given in the other tab.
       */
      await mount(null);

      markerFor("1", "granted");
      await fromAnotherTab("granted");

      expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe(
        "granted"
      );
      expect(window.localStorage.getItem(SYNCED_KEY)).not.toBeNull();
    });
  });

  /*
   * The residual risk under `markSynced`'s old comment. If the marker cannot
   * be written, the decision that outlives it has no account attached to it,
   * and the *next* account to sign in reads it as its own — which is the
   * outcome the account rule names the worst of the three, reached by a route
   * the account rule did not close.
   */
  describe("when the sync marker cannot be persisted", () => {
    /*
     * Patched on `Storage.prototype`, not on `window.localStorage`: jsdom's
     * `localStorage` is a Proxy, and a spy installed as an own property on
     * it is never consulted — the `get` trap hands back the prototype's
     * method. A spy on the instance therefore *passes* against code that
     * still writes the marker, which is the worst shape a test can have.
     */
    const breakMarkerWrites = (mode: "no-op" | "throw") => {
      const write = Storage.prototype.setItem;

      vi.spyOn(console, "warn").mockImplementation(() => {
        // The failure is logged; silenced here, not asserted.
      });

      vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
        this: Storage,
        key: string,
        value: string
      ) {
        if (key === SYNCED_KEY) {
          if (mode === "throw") {
            throw new DOMException("quota exceeded", "QuotaExceededError");
          }

          return;
        }

        write.call(this, key, value);
      });
    };

    it("does not keep a decision it could not attach an account to", async () => {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(okResponse());
      breakMarkerWrites("throw");

      await mount(1);

      // The row was written — the decision is on the record for account 1.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // What is not kept is the browser's copy, because this browser can no
      // longer say whose it is.
      expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBeNull();
    });

    it("catches a store that accepts the write and keeps nothing, not only one that throws", async () => {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
      vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());
      breakMarkerWrites("no-op");

      await mount(1);

      expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBeNull();
    });

    it("so the next account does not inherit it", async () => {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(okResponse());
      breakMarkerWrites("throw");

      await mount(1);
      await reload(2);

      // One row, for account 1, and nothing fabricated for account 2.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
