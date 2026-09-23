import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleSwitcher } from "./LocaleSwitcher";

/*
 * `next/navigation`'s hooks read a router context that only exists inside a
 * rendered Next tree, so they are stubbed here. The component's whole job is
 * turning "where am I" into three hrefs, and that is exactly what the stub
 * lets us vary.
 *
 * Rendered with `react-dom/server` rather than Testing Library: the assertions
 * are all about emitted markup, and reaching for a renderer this app does not
 * already depend on to read an `href` would be a dependency bought for
 * nothing.
 */
const navigation = vi.hoisted(() => ({
  pathname: "/en/gestures",
  query: "",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

/**
 * Parses the emitted markup instead of matching it with a regular expression,
 * so `&` inside a query string is read back as `&` and not as `&amp;` — which
 * is what the browser does with the attribute, and the difference is a
 * hand-rolled matcher reporting a bug that is not there.
 */
const linkFor = (markup: string, locale: string): HTMLAnchorElement => {
  const host = document.createElement("div");
  host.innerHTML = markup;

  const link = host.querySelector<HTMLAnchorElement>(
    `a[data-testid="locale-switch-${locale}"]`
  );

  if (link === null) {
    throw new Error(`no switch link rendered for ${locale}`);
  }

  return link;
};

describe("LocaleSwitcher", () => {
  beforeEach(() => {
    navigation.pathname = "/en/gestures";
    navigation.query = "";
  });

  it("offers every locale the site serves", () => {
    const markup = renderToStaticMarkup(<LocaleSwitcher current="en" />);

    expect(markup).toContain("Nederlands");
    expect(markup).toContain("English");
    expect(markup).toContain("Français");
  });

  it("points each link at the current page in that locale", () => {
    const markup = renderToStaticMarkup(<LocaleSwitcher current="en" />);

    expect(linkFor(markup, "nl").getAttribute("href")).toBe("/nl/gestures");
    expect(linkFor(markup, "fr").getAttribute("href")).toBe("/fr/gestures");
  });

  it("carries the query string across the switch", () => {
    // A visitor two pages into a filtered list should stay where they are.
    navigation.query = "q=hallo&page=2";

    const markup = renderToStaticMarkup(<LocaleSwitcher current="en" />);

    expect(linkFor(markup, "fr").getAttribute("href")).toBe(
      "/fr/gestures?q=hallo&page=2"
    );
  });

  it("emits no question mark when there is no query", () => {
    // `${pathname}?${""}` is a different URL to `pathname`, and it is the one
    // that ends up in the address bar and in anything the visitor copies.
    const markup = renderToStaticMarkup(<LocaleSwitcher current="en" />);

    expect(linkFor(markup, "fr").getAttribute("href")).toBe("/fr/gestures");
    expect(markup).not.toContain("?");
  });

  it("marks the locale being read and only that one", () => {
    const markup = renderToStaticMarkup(<LocaleSwitcher current="en" />);

    expect(linkFor(markup, "en").getAttribute("aria-current")).toBe("true");
    expect(linkFor(markup, "nl").getAttribute("aria-current")).toBeNull();
    expect(linkFor(markup, "fr").getAttribute("aria-current")).toBeNull();
  });

  it("tags each link with the language it leads to", () => {
    // Without `hreflang` a screen reader announces "Français" in Dutch.
    const markup = renderToStaticMarkup(<LocaleSwitcher current="nl" />);

    expect(linkFor(markup, "fr").getAttribute("hreflang")).toBe("fr");
    expect(linkFor(markup, "nl").getAttribute("hreflang")).toBe("nl");
  });
});
