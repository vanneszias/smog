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
    document.body.appendChild(container);
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
