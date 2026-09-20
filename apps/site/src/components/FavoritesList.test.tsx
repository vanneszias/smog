import type { ReactElement, ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GUEST_FAVORITES_KEY } from "@/lib/guestStore";
import { FavoritesList } from "./FavoritesList";

/*
 * `next/link` reads the App Router context, which only exists inside a
 * rendered Next tree. The component's job has nothing to do with the router —
 * it turns local ids into cards — so the link is stubbed down to the `<a>`
 * the real one emits.
 */
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

let container: HTMLDivElement;
let root: Root;

const mount = async (ui: ReactElement): Promise<void> => {
  await act(async () => {
    root.render(ui);
  });
};

const respondWith = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue({
    json: () => Promise.resolve(body),
    ok: status >= 200 && status < 300,
    status,
  });

/** A Payload document, which is what `/api/gestures` answers with. */
const gesture = (id: number, name: string) => ({
  categories: [],
  id,
  isActive: true,
  name,
  playbackId: `pb-${id}`,
});

const cardNames = (): string[] =>
  [
    ...container.querySelectorAll<HTMLElement>(
      '[aria-label="Favorieten"] > li h3'
    ),
  ].map((heading) => heading.textContent ?? "");

const isLoading = (): boolean =>
  container.querySelector('[aria-busy="true"]') !== null;

const heading = (): string =>
  container.querySelector("h3")?.textContent ?? "(no heading)";

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  // Restore before clearing: a `getItem` spy that still throws would throw
  // here rather than in the test that installed it, and would leak into
  // every test after it in this file.
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("FavoritesList", () => {
  it("renders placeholders on the first paint, not an empty state", () => {
    // The whole reason this page has a client island. The server does not
    // know what the guest favourited, so the markup it sends must say
    // "looking" — an empty state that shows for a tick and is then replaced
    // by six cards is a visible bug, and it is the default behaviour of any
    // implementation whose initial state is "ready with nothing".
    //
    // Rendered with `react-dom/server`, which runs no effects, so this is
    // exactly the first paint and not an approximation of it.
    const markup = renderToStaticMarkup(<FavoritesList locale="nl" />);

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Favorieten laden");
    expect(markup).not.toContain("Nog geen favorieten");
  });

  it("keeps showing placeholders while the lookup is in flight", () => {
    // The same rule one step later: ids were found, so the answer is not
    // known yet and the list must not claim to be empty.
    localStorage.setItem(GUEST_FAVORITES_KEY, '["9"]');
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => undefined))
    );

    act(() => {
      root.render(<FavoritesList locale="nl" />);
    });

    expect(isLoading()).toBe(true);
    expect(container.textContent).not.toContain("Nog geen favorieten");
  });

  it("shows the empty state once the store turns out to be empty", async () => {
    await mount(<FavoritesList locale="nl" />);

    expect(isLoading()).toBe(false);
    expect(heading()).toBe("Nog geen favorieten");
  });

  it("asks the server for nothing when there are no favorites", async () => {
    const fetchMock = respondWith({ docs: [] });
    vi.stubGlobal("fetch", fetchMock);

    await mount(<FavoritesList locale="nl" />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("degrades to the empty state when localStorage is denied", async () => {
    // Review Focus item 3 at the page level: a private window must show "no
    // favorites", not a blank page.
    const fetchMock = respondWith({ docs: [] });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    await mount(<FavoritesList locale="nl" />);

    expect(heading()).toBe("Nog geen favorieten");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders a card for each favourite, in the order they were favourited", async () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '["9","4"]');
    vi.stubGlobal(
      "fetch",
      respondWith({
        docs: [gesture(9, "Negen"), gesture(4, "Vier")],
      })
    );

    await mount(<FavoritesList locale="nl" />);

    expect(cardNames()).toEqual(["Negen", "Vier"]);
  });

  it("asks in the reader's locale for exactly the stored ids", async () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '["9","4"]');
    const fetchMock = respondWith({ docs: [] });
    vi.stubGlobal("fetch", fetchMock);

    await mount(<FavoritesList locale="fr" />);

    const url = new URL(
      String(fetchMock.mock.calls[0]?.[0]),
      "https://example.invalid"
    );

    expect(url.pathname).toBe("/api/gestures");
    expect(url.searchParams.get("where[id][in]")).toBe("9,4");
    expect(url.searchParams.get("locale")).toBe("fr");
  });

  it("does not ask about a stored id that is not an id", async () => {
    // A corrupt store must not turn into a malformed query. With every
    // stored id unusable there is nothing to ask about at all.
    localStorage.setItem(GUEST_FAVORITES_KEY, '["abc","0",""]');
    const fetchMock = respondWith({ docs: [] });
    vi.stubGlobal("fetch", fetchMock);

    await mount(<FavoritesList locale="nl" />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(heading()).toBe("Nog geen favorieten");
  });

  it("shows an error state when the lookup fails", async () => {
    // The body is deliberately a *valid, empty* answer: the status alone has
    // to decide. A version that only checked the shape would read this as
    // "you have no favorites" and quietly tell the reader their list is
    // empty when the server never looked.
    localStorage.setItem(GUEST_FAVORITES_KEY, '["9"]');
    vi.stubGlobal("fetch", respondWith({ docs: [] }, 500));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await mount(<FavoritesList locale="nl" />);

    expect(heading()).toBe("Favorieten konden niet geladen worden");
  });

  it("shows an error state rather than rendering an answer of the wrong shape", async () => {
    // `response.json()` succeeding says the bytes were JSON, not that they
    // were ours. A proxy error page and a half-deployed build both answer a
    // fetch with something, and a cast here would put `undefined.name` in
    // the render.
    localStorage.setItem(GUEST_FAVORITES_KEY, '["9"]');
    vi.stubGlobal("fetch", respondWith({ docs: "nope" }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await mount(<FavoritesList locale="nl" />);

    expect(heading()).toBe("Favorieten konden niet geladen worden");
  });

  it("drops an entry that is not a card rather than rendering a blank one", async () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '["9","4"]');
    vi.stubGlobal("fetch", respondWith({ docs: [gesture(9, "Negen"), null] }));

    await mount(<FavoritesList locale="nl" />);

    expect(cardNames()).toEqual(["Negen"]);
  });

  it("removes a card, and the stored id, when its heart is pressed", async () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '["9","4"]');
    vi.stubGlobal(
      "fetch",
      respondWith({
        docs: [gesture(9, "Negen"), gesture(4, "Vier")],
      })
    );

    await mount(<FavoritesList locale="nl" />);

    const first = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Favoriet"]'
    );

    await act(async () => {
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(cardNames()).toEqual(["Vier"]);
    expect(localStorage.getItem(GUEST_FAVORITES_KEY)).toBe('["4"]');
  });

  it("falls back to the empty state when the last card is removed", async () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '["9"]');
    vi.stubGlobal("fetch", respondWith({ docs: [gesture(9, "Negen")] }));

    await mount(<FavoritesList locale="nl" />);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Favoriet"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(heading()).toBe("Nog geen favorieten");
  });
});
