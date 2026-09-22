import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_CONSENT_KEY } from "@/lib/consentStore";
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

  const mount = async (userId: number | string = 1) => {
    await act(async () => {
      root.render(<ConsentSync userId={userId} />);
    });
  };

  const okResponse = () =>
    new Response(JSON.stringify({ analyticsConsent: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

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
   * Ruling 12: the shared/library computer walkthrough. Account 1 granted
   * and its marker is on record; account 2 signs in on the same browser.
   * `localStorage` still says "granted" — that is account 1's answer, not
   * account 2's — and the realistic bug is treating it as already
   * reconciled (or worse, syncing it as if account 2 had said so). Neither
   * may happen: the browser's decision must be cleared, and nothing posted,
   * so the banner asks account 2 for themselves.
   */
  describe("when the marker names a different account", () => {
    const markerFor = (userId: string, value: string) =>
      window.localStorage.setItem(
        SYNCED_KEY,
        JSON.stringify({ userId, value })
      );

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
  });
});
