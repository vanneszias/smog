import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_CONSENT_KEY } from "@/lib/consentStore";
import { AccountConsentControl } from "./AccountConsentControl";
import { ConsentSync } from "./ConsentSync";

let container: HTMLDivElement;
let root: Root;

describe("AccountConsentControl", () => {
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

  const mount = async (
    props: Parameters<typeof AccountConsentControl>[0] = {
      initialConsent: null,
      locale: "nl",
    }
  ) => {
    await act(async () => {
      root.render(<AccountConsentControl {...props} />);
    });
  };

  /**
   * The account page as it really renders: this section, plus the
   * reconciler `[locale]/layout.tsx` mounts above it. The two halves of one
   * toggle — write the store, record the row — live in different components
   * now, so the property that there is exactly *one* row per toggle is only
   * visible with both of them mounted.
   */
  const mountWithReconciler = async (userId: number | string = 42) => {
    await act(async () => {
      root.render(
        <>
          <AccountConsentControl initialConsent={null} locale="nl" />
          <ConsentSync userId={userId} />
        </>
      );
    });
  };

  const okResponse = () =>
    new Response(JSON.stringify({ analyticsConsent: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  const switchEl = () =>
    container.querySelector('[role="switch"]') as HTMLButtonElement;

  it("shows nothing for the switch until it has read the store", () => {
    // The server cannot read localStorage, so the first render has to match
    // what the server produced for that half — nothing — same rule as
    // `ConsentBanner`. The recorded-decision caption is unaffected: it is
    // server-known already, see the next tests.
    const html = renderToStaticMarkup(
      <AccountConsentControl initialConsent={null} locale="nl" />
    );
    expect(html).not.toContain('role="switch"');
  });

  /*
   * The switch's own behaviour is `ConsentDeviceControl.test.tsx`'s subject
   * — it is the same component the privacy page renders for guests. What is
   * asserted here is what only this composition can show: one toggle, one
   * row, and the two Ruling 11 pins below, which belong to the component
   * that actually receives the account's recorded row.
   */
  it("records a toggle exactly once, through the reconciler and not twice", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse());

    await mountWithReconciler(42);
    await act(async () => {
      switchEl().click();
    });

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("granted");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/consent");
    expect(JSON.parse(String(init?.body))).toEqual({ analyticsConsent: true });
    // Written for the account the layout passed down, not a hardcoded id.
    expect(window.localStorage.getItem("smog.consent.synced")).toBe(
      JSON.stringify({ userId: "42", value: "granted" })
    );
  });

  it("records a withdrawal as its own row, not as an amendment", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    /*
     * Already reconciled for this account before the page loads — otherwise
     * the reconciler's own first-sync POST would be counted here as well,
     * and this test is about what the *toggle* causes.
     */
    window.localStorage.setItem(
      "smog.consent.synced",
      JSON.stringify({ userId: "42", value: "granted" })
    );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse());

    await mountWithReconciler(42);
    await act(async () => {
      switchEl().click();
    });

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("denied");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      analyticsConsent: false,
    });
  });

  /*
   * Ruling 11 (per the coordinator's decision on this task): the server
   * never writes the browser's consent flag, so the switch's state must
   * come from `localStorage` alone, never from the account's recorded row.
   * Two tests pin this, because a reviewer proved one alone does not: this
   * one covers an *explicit* local decision that disagrees with the row.
   */
  it("the switch is unaffected by what the account's row says", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "denied");

    await mount({
      initialConsent: {
        analyticsConsent: true,
        recordedAt: "2026-01-05T00:00:00.000Z",
      },
      locale: "nl",
    });

    expect(switchEl()?.getAttribute("aria-checked")).toBe("false");
  });

  /*
   * The realistic violation: a fallback used only when this device has not
   * decided (`initialConsent?.analyticsConsent ?? false`, or similar), which
   * the test above cannot catch because it only ever sets an *explicit*
   * local value. Confirmed to fail against exactly that mutation: with the
   * effect changed to
   *
   *   const local = readConsent();
   *   if (local === null) {
   *     setChecked(initialConsent?.analyticsConsent === true);
   *     return;
   *   }
   *   setChecked(local === "granted");
   *
   * this test fails (`aria-checked` becomes `"true"`), and it was restored
   * byte for byte afterwards. See the Task 6 report for the transcript.
   */
  it("does not fall back to the account's row when this device has not decided", async () => {
    // `beforeEach` already clears localStorage — no key at all, the
    // undecided case, not an explicit "denied".
    await mount({
      initialConsent: {
        analyticsConsent: true,
        recordedAt: "2026-01-05T00:00:00.000Z",
      },
      locale: "nl",
    });

    expect(switchEl()?.getAttribute("aria-checked")).toBe("false");
  });

  it("renders the recorded answer and its date when a row exists", async () => {
    await mount({
      initialConsent: {
        analyticsConsent: true,
        recordedAt: "2026-01-05T00:00:00.000Z",
      },
      locale: "nl",
    });

    const caption = container.querySelector(
      '[data-testid="account-consent-record"]'
    );
    expect(caption?.textContent).toContain("toegestaan");
    expect(caption?.textContent).toContain("5 januari 2026");
  });

  it("renders a refusal too, not only an acceptance", async () => {
    await mount({
      initialConsent: {
        analyticsConsent: false,
        recordedAt: "2026-02-11T00:00:00.000Z",
      },
      locale: "en",
    });

    const caption = container.querySelector(
      '[data-testid="account-consent-record"]'
    );
    expect(caption?.textContent).toContain("declined");
    expect(caption?.textContent).toContain("11 February 2026");
  });

  it("renders the no-answer state when there is no recorded row, not a default that reads as a refusal", async () => {
    await mount({ initialConsent: null, locale: "fr" });

    const caption = container.querySelector(
      '[data-testid="account-consent-record"]'
    );
    expect(caption?.textContent).toBe(
      "Aucune réponse n'est encore enregistrée pour votre compte."
    );
  });

  it("speaks each locale for the recorded-answer caption", async () => {
    const rendered = new Set<string>();

    for (const locale of ["nl", "en", "fr"] as const) {
      await act(async () => {
        root.unmount();
      });
      root = createRoot(container);
      await mount({ initialConsent: null, locale });
      rendered.add(container.textContent ?? "");
    }

    expect(rendered.size).toBe(3);
  });
});
