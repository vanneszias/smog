import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LocaleHomePage, { generateMetadata } from "./page";

/*
 * The home page, rendered for real and read back from the DOM.
 *
 * The page is an async Server Component, so it is awaited for its element tree
 * and that tree is rendered into jsdom with `createRoot` and React's own
 * `act` — the pattern `privacy/page.test.tsx` records, and for its reason:
 * `apps/site` has no `@testing-library/react`.
 *
 * The categories come from a mocked Payload client rather than the local D1.
 * That database is never cleared between runs, so "the first eight active
 * categories" there is whatever earlier runs left behind, and "no categories
 * at all" cannot be arranged. The mock also lets this file see the query the
 * page actually sends, which is the part that has to stay bounded.
 * `gestureQuery.int.test.ts` covers the same query against the real database.
 */
const find = vi.fn();

vi.mock("@/lib/payloadClient", () => ({
  getPayloadClient: vi.fn(async () => ({ find })),
}));

let container: HTMLDivElement;
let root: Root;

const render = async (locale = "nl") => {
  const tree = await LocaleHomePage({ params: Promise.resolve({ locale }) });

  await act(async () => {
    root.render(tree);
  });
};

const hrefOf = (selector: string): string | null | undefined =>
  container.querySelector(selector)?.getAttribute("href");

const linkNamed = (name: string): HTMLAnchorElement | undefined =>
  Array.from(container.querySelectorAll("a")).find(
    (link) => link.textContent?.trim() === name
  );

describe("the locale home page", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    find.mockReset();
    find.mockResolvedValue({
      docs: [
        { id: 3, name: "Dieren" },
        { id: 7, name: "Eten" },
      ],
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it.each([
    {
      locale: "nl",
      title: "Mensen ondersteunen hun spraak van nature met gebaren",
    },
    {
      locale: "en",
      title: "People naturally support their speech with gestures",
    },
    {
      locale: "fr",
      title: "Les personnes accompagnent naturellement leur parole de gestes",
    },
  ])("heads the $locale page with the one headline", async ({
    locale,
    title,
  }) => {
    await render(locale);

    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe(title);
    // Every section below the hero is an `<h2>`, so the outline has one root.
    expect(container.querySelectorAll("h2").length).toBeGreaterThanOrEqual(4);
  });

  it("searches with a plain GET form onto the gestures list", async () => {
    await render("en");

    const form = container.querySelector("form");
    expect(form?.getAttribute("method")).toBe("get");
    expect(form?.getAttribute("action")).toBe("/en/gestures");

    const input = form?.querySelector("input");
    expect(input?.getAttribute("name")).toBe("q");
    expect(input?.getAttribute("type")).toBe("search");
    // Labelled, and submitted by a real submit button — no script involved.
    expect(
      container.querySelector(`label[for="${input?.id}"]`)?.textContent
    ).toBe("Search for a gesture");
    expect(form?.querySelector('button[type="submit"]')).not.toBeNull();
  });

  it("links each category to the list filtered by it, in the order Payload returned", async () => {
    await render("nl");

    const section = container.querySelector('[data-testid="home-categories"]');
    const links = Array.from(section?.querySelectorAll("li a") ?? []);

    expect(
      links.map((link) => [link.textContent, link.getAttribute("href")])
    ).toEqual([
      ["Dieren", "/nl/gestures?category=3"],
      ["Eten", "/nl/gestures?category=7"],
    ]);
    expect(linkNamed("Bekijk alle gebaren")?.getAttribute("href")).toBe(
      "/nl/gestures"
    );
  });

  it("asks for at most eight active categories, in one query, as a visitor", async () => {
    await render("fr");

    expect(find).toHaveBeenCalledTimes(1);
    expect(find.mock.calls[0]?.[0]).toMatchObject({
      collection: "categories",
      limit: 8,
      locale: "fr",
      overrideAccess: false,
      pagination: false,
      sort: ["name", "id"],
      where: { isActive: { equals: true } },
    });
  });

  it("leaves the category section out when there are no categories", async () => {
    find.mockResolvedValue({ docs: [] });

    await render("nl");

    expect(
      container.querySelector('[data-testid="home-categories"]')
    ).toBeNull();
    // The rest of the page is still there.
    expect(container.querySelector("form")).not.toBeNull();
    expect(hrefOf('a[href="/nl/sponsor"]')).toBe("/nl/sponsor");
  });

  it("still renders, without the categories, when they cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {
      /* expected: the page logs the failure */
    });
    find.mockRejectedValue(new Error("database is locked"));

    await render("nl");

    expect(container.querySelector("h1")).not.toBeNull();
    expect(
      container.querySelector('[data-testid="home-categories"]')
    ).toBeNull();
    expect(error).toHaveBeenCalledWith(
      "[home] Failed to load the categories:",
      expect.any(Error)
    );
    error.mockRestore();
  });

  it.each([
    {
      appStore: "Download in de App Store",
      googlePlay: "Ontdek het op Google Play",
      locale: "nl",
    },
    {
      appStore: "Download on the App Store",
      googlePlay: "Get it on Google Play",
      locale: "en",
    },
    {
      appStore: "Télécharger dans l'App Store",
      googlePlay: "Disponible sur Google Play",
      locale: "fr",
    },
  ])("links the $locale page to both stores", async ({
    appStore,
    googlePlay,
    locale,
  }) => {
    await render(locale);

    const apple = linkNamed(appStore);
    const google = linkNamed(googlePlay);

    expect(apple?.getAttribute("href")).toBe(
      "https://apps.apple.com/app/smog-co/id6758547774"
    );
    expect(google?.getAttribute("href")).toBe(
      "https://play.google.com/store/apps/details?id=be.zias.smog"
    );
    expect(apple?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(google?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it.each([
    { cta: "Word sponsor", locale: "nl" },
    { cta: "Become a sponsor", locale: "en" },
    { cta: "Devenir parrain", locale: "fr" },
  ])("sends the $locale sponsor button to the sponsor wizard", async ({
    cta,
    locale,
  }) => {
    await render(locale);

    expect(linkNamed(cta)?.getAttribute("href")).toBe(`/${locale}/sponsor`);
  });

  it("says what SMOG stands for", async () => {
    await render("en");

    expect(container.textContent).toContain(
      "Spreken Met Ondersteuning van Gebaren"
    );
  });

  it("hides the hand illustrations from assistive technology", async () => {
    await render("nl");

    const hands = Array.from(
      container.querySelectorAll<HTMLElement>('[aria-hidden="true"]')
    ).filter((element) => element.style.mask.includes("/brand/hand-"));

    expect(hands).toHaveLength(3);
  });

  it.each([
    "nl",
    "en",
    "fr",
  ])("describes the %s page and names its canonical URL", async (locale) => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale }),
    });

    expect(metadata.description).toEqual(expect.any(String));
    expect(metadata.description).not.toBe("");
    expect(metadata.alternates?.canonical).toBe(`/${locale}`);
    // The layout's default title, the site's name, is the home page's title.
    expect(metadata).not.toHaveProperty("title");
  });
});
