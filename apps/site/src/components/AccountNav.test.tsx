import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { User } from "@/payload-types";
import { AccountNav } from "./AccountNav";

/*
 * Rendered with `react-dom/server` and read back out of a detached DOM, the
 * same way `LocaleSwitcher.test.tsx` does it: every assertion here is about
 * emitted markup — an href, a form method, a rendered address — and pulling
 * in a renderer this app does not already depend on would buy nothing.
 */
const render = (markup: string): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = markup;

  return host;
};

const nav = (user: null | User) =>
  render(renderToStaticMarkup(<AccountNav locale="nl" user={user} />));

const signedIn = { email: "someone@example.test" } as User;

describe("AccountNav", () => {
  it("offers the two ways in when nobody is signed in", () => {
    const host = nav(null);

    expect(
      host.querySelector<HTMLAnchorElement>('[data-testid="sign-in-link"]')
        ?.href
    ).toContain("/nl/sign-in");
    expect(
      host.querySelector<HTMLAnchorElement>('[data-testid="sign-up-link"]')
        ?.href
    ).toContain("/nl/sign-up");
  });

  it("shows no sign-out control to a visitor who is not signed in", () => {
    expect(nav(null).querySelector('[data-testid="sign-out"]')).toBeNull();
  });

  it("names the signed-in account", () => {
    // This is the string the locale-switch e2e reads to decide whether the
    // session survived, so it has to be the address and not a generic word.
    expect(
      nav(signedIn).querySelector('[data-testid="account-email"]')?.textContent
    ).toBe("someone@example.test");
  });

  it("offers no way back in to somebody already signed in", () => {
    const host = nav(signedIn);

    expect(host.querySelector('[data-testid="sign-in-link"]')).toBeNull();
    expect(host.querySelector('[data-testid="sign-up-link"]')).toBeNull();
  });

  it("signs out with a POST and not with a link", () => {
    /*
     * A `GET /auth/sign-out` is a URL any page on the internet can put in an
     * `<img src>`, and one a link prefetcher or a crawler will follow on its
     * own. A POST is neither — and Payload's `SameSite=Lax` cookie is not
     * sent on a cross-site POST, so an attacker's form arrives with no
     * session to end.
     */
    const host = nav(signedIn);
    const form = host.querySelector<HTMLFormElement>("form");

    expect(form?.getAttribute("method")).toBe("post");
    expect(form?.getAttribute("action")).toBe("/auth/sign-out");
    expect(host.querySelector('[data-testid="sign-out"]')).not.toBeNull();
    expect(host.querySelector('a[href*="sign-out"]')).toBeNull();
  });

  it("tells the endpoint which locale to come back to", () => {
    const locale = render(
      renderToStaticMarkup(<AccountNav locale="fr" user={signedIn} />)
    ).querySelector<HTMLInputElement>('input[name="locale"]');

    expect(locale?.getAttribute("type")).toBe("hidden");
    expect(locale?.getAttribute("value")).toBe("fr");
  });

  it("is a landmark a screen reader can find", () => {
    expect(nav(signedIn).querySelector("nav")?.getAttribute("aria-label")).toBe(
      "Account"
    );
  });
});
