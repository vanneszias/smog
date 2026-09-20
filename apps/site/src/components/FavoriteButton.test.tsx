import type { ReactElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GUEST_FAVORITES_KEY } from "@/lib/guestStore";
import { FavoriteButton } from "./FavoriteButton";

/*
 * Rendered with `react-dom/client` and React's own `act` rather than with
 * Testing Library. `@testing-library/react` is hoisted into the root
 * `node_modules` by `@smog/ui-web`, so importing it here would *work* and
 * then fail `knip` as an unlisted dependency — and adding a dependency to
 * this app to read one attribute is not a trade worth making. What this
 * component does is: read local state on mount, and write it on click. Both
 * are observable on the real DOM node.
 */
let container: HTMLDivElement;
let root: Root;

const mount = async (ui: ReactElement): Promise<void> => {
  await act(async () => {
    root.render(ui);
  });
};

const button = (): HTMLButtonElement => {
  const element = container.querySelector("button");

  if (element === null) {
    throw new Error("FavoriteButton rendered no button");
  }

  return element;
};

const press = async (): Promise<void> => {
  await act(async () => {
    button().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

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
  // Restore first, then clear: clearing through a throwing spy would throw
  // in the hook rather than in the test that installed it. A spy left
  // installed leaks into every later test in this file.
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("FavoriteButton", () => {
  it("renders unpressed when the gesture is not favourited", async () => {
    await mount(<FavoriteButton gestureId="7" locale="nl" signedIn={false} />);

    expect(button().getAttribute("aria-pressed")).toBe("false");
  });

  it("renders pressed when the gesture is already favourited", async () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '["7"]');

    await mount(<FavoriteButton gestureId="7" locale="nl" signedIn={false} />);

    expect(button().getAttribute("aria-pressed")).toBe("true");
  });

  it("ignores a stored favorite for a different gesture", async () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '["8"]');

    await mount(<FavoriteButton gestureId="7" locale="nl" signedIn={false} />);

    expect(button().getAttribute("aria-pressed")).toBe("false");
  });

  it("stores the gesture when pressed", async () => {
    await mount(<FavoriteButton gestureId="7" locale="nl" signedIn={false} />);
    await press();

    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem(GUEST_FAVORITES_KEY)).toBe('["7"]');
  });

  it("removes the gesture when pressed again", async () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '["7"]');

    await mount(<FavoriteButton gestureId="7" locale="nl" signedIn={false} />);
    await press();

    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(localStorage.getItem(GUEST_FAVORITES_KEY)).toBe("[]");
  });

  it("keeps one accessible name in both states", async () => {
    // Relabelling a toggle between "add" and "remove" reads as a different
    // control each time it is pressed. `aria-pressed` carries the state;
    // the name stays put. Same rule as `GestureCard`'s own control.
    await mount(<FavoriteButton gestureId="7" locale="nl" signedIn={false} />);

    const name = button().getAttribute("aria-label");

    await press();

    expect(button().getAttribute("aria-label")).toBe(name);
    expect(name).toBe("Favoriet");
  });

  it("renders unpressed instead of throwing when localStorage is denied", async () => {
    // Review Focus item 3, at the component rather than the helper. A throw
    // inside the mount effect is an unhandled error in the client tree,
    // which blanks everything below the nearest boundary.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    await mount(<FavoriteButton gestureId="7" locale="nl" signedIn={false} />);

    expect(button().getAttribute("aria-pressed")).toBe("false");
  });

  it("still reflects the press when the write is refused", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    await mount(<FavoriteButton gestureId="7" locale="nl" signedIn={false} />);
    await press();

    expect(button().getAttribute("aria-pressed")).toBe("true");
  });

  it("does not claim to be ready before it has read the store", () => {
    // The server-rendered button is not wired to anything: React has not
    // hydrated, so a press does nothing at all and does so silently. The
    // e2e suite waits for this attribute, and it was added because without
    // it that suite pressed a dead button and failed depending on how fast
    // the page compiled.
    //
    // `react-dom/server` runs no effects, so this is exactly the first paint.
    const markup = renderToStaticMarkup(
      <FavoriteButton gestureId="7" locale="nl" signedIn={false} />
    );

    expect(markup).not.toContain("data-ready");
    expect(markup).toContain('aria-pressed="false"');
  });

  it("marks itself ready once it has read the store", async () => {
    await mount(<FavoriteButton gestureId="7" locale="nl" signedIn={false} />);

    expect(button().getAttribute("data-ready")).toBe("true");
  });

  it("marks itself ready even when the store is denied", async () => {
    // A reader in a private window still gets a working control for the
    // rest of their visit; it just cannot remember anything afterwards.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    await mount(<FavoriteButton gestureId="7" locale="nl" signedIn={false} />);

    expect(button().getAttribute("data-ready")).toBe("true");
  });

  it("does not submit a form it happens to sit inside", async () => {
    // The detail page has no form today, but `Button` defaults `type` for
    // exactly this reason and a favourite control that submits its
    // surroundings is a silent, destructive failure.
    await mount(<FavoriteButton gestureId="7" locale="nl" signedIn={false} />);

    expect(button().getAttribute("type")).toBe("button");
  });
});

/*
 * The signed-in half. Everything above this point is the guest path and is
 * unchanged from Stage 3 — deliberately, because "signed out behaves exactly
 * as it did" is one of the two things the mode switch has to get right.
 *
 * `fetch` is stubbed rather than mocked at the module boundary, so these
 * exercise `writeAccountFavorite` for real: the URL, the method, the body and
 * the status handling are all part of what is under test here, and a mock of
 * that function would let every one of them drift.
 */
describe("FavoriteButton on an account", () => {
  const respondWith = (body: unknown, status = 200) =>
    vi.fn().mockResolvedValue({
      json: () => Promise.resolve(body),
      ok: status >= 200 && status < 300,
      status,
    });

  const error = (): null | string =>
    container.querySelector('[data-testid="favorite-error"]')?.textContent ??
    null;

  const signedIn = (props: { initialFavorite?: boolean } = {}) => (
    <FavoriteButton
      gestureId="7"
      initialFavorite={props.initialFavorite ?? false}
      locale="nl"
      signedIn={true}
    />
  );

  it("shows what the account holds, not what this browser remembers", async () => {
    /*
     * The mode switch, from the reading side. A signed-in visitor who
     * favourited this gesture as a guest on some other machine must see the
     * account's answer — and one who favourited it in *this* browser before
     * signing in must not see a filled heart for a favourite the account
     * does not have. Reconciling those two is Task 6's merge, not a silent
     * read of the wrong store.
     */
    localStorage.setItem(GUEST_FAVORITES_KEY, '["7"]');

    await mount(signedIn({ initialFavorite: false }));

    expect(button().getAttribute("aria-pressed")).toBe("false");
  });

  it("renders pressed when the account already holds the gesture", async () => {
    await mount(signedIn({ initialFavorite: true }));

    expect(button().getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the account's answer on the very first paint", () => {
    // No effect needed and no flash: the server knew, so the heart is right
    // in the markup it sent. `react-dom/server` runs no effects, so this is
    // exactly the first paint.
    expect(renderToStaticMarkup(signedIn({ initialFavorite: true }))).toContain(
      'aria-pressed="true"'
    );
  });

  it("does not claim to be ready before it has hydrated", () => {
    /*
     * The regression this task caused and then fixed, pinned so it cannot
     * come back. Deriving `data-ready` from "the answer is known" makes it
     * true in the *server's* markup for a signed-in reader — so
     * `expect(heart).toHaveAttribute("data-ready", "true")` returns instantly,
     * the spec presses a button React has not wired up yet, and the press
     * vanishes silently. That is precisely the failure the attribute was
     * invented to stop, and six e2e specs hit it before this test existed.
     *
     * The attribute means "this control is alive", which on both paths is
     * only true after the mount effect.
     */
    const markup = renderToStaticMarkup(signedIn({ initialFavorite: true }));

    expect(markup).not.toContain("data-ready");
  });

  it("marks itself ready once it has hydrated", async () => {
    await mount(signedIn({ initialFavorite: true }));

    expect(button().getAttribute("data-ready")).toBe("true");
  });

  it("writes to the account and not to this browser", async () => {
    const fetchMock = respondWith({ favorite: true });
    vi.stubGlobal("fetch", fetchMock);

    await mount(signedIn());
    await press();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("/account/favorites");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      favorite: true,
      gestureId: "7",
    });
    // The guest store is somebody else's business now.
    expect(localStorage.getItem(GUEST_FAVORITES_KEY)).toBeNull();
    expect(button().getAttribute("aria-pressed")).toBe("true");
  });

  it("asks for the state it wants rather than for a toggle", async () => {
    /*
     * There are no transactions on any write path in this app and a press
     * can be retried by the reader, by a flaky connection or by Task 6's
     * merge. A toggle applied twice undoes itself; a desired state applied
     * twice is the same state.
     */
    const fetchMock = respondWith({ favorite: false });
    vi.stubGlobal("fetch", fetchMock);

    await mount(signedIn({ initialFavorite: true }));
    await press();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(JSON.parse(String(init.body))).toEqual({
      favorite: false,
      gestureId: "7",
    });
    expect(button().getAttribute("aria-pressed")).toBe("false");
  });

  it("believes the server's answer and not the one it asked for", async () => {
    // The endpoint is idempotent, so "favourite this" against a gesture the
    // account already holds answers `true` — and any answer at all beats the
    // component's own guess, which is the whole reason it is echoed back.
    vi.stubGlobal("fetch", respondWith({ favorite: true }));

    await mount(signedIn({ initialFavorite: true }));
    await press();

    expect(button().getAttribute("aria-pressed")).toBe("true");
  });

  it("does not fill the heart when the write fails", async () => {
    // Optimistic UI that lies is worse than a slow one: the reader closes
    // the tab believing the gesture was saved and nothing ever tells them.
    vi.stubGlobal("fetch", respondWith({ favorite: true }, 500));

    await mount(signedIn());
    await press();

    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(error()).toContain("Bewaren is niet gelukt");
  });

  it("does not un-fill the heart when the removal fails", async () => {
    // The other direction, which a test of the first alone would miss: a
    // card that disappears on a write that failed is the same lie.
    vi.stubGlobal("fetch", respondWith({ favorite: false }, 500));

    await mount(signedIn({ initialFavorite: true }));
    await press();

    expect(button().getAttribute("aria-pressed")).toBe("true");
  });

  it("does not fill the heart when the answer is not the shape we asked for", async () => {
    // A proxy error page, a half-deployed build, or a 200 whose body lost
    // the field. `undefined` is falsy, so a component that read it straight
    // would silently un-fill every heart it was told nothing about.
    vi.stubGlobal("fetch", respondWith({ ok: true }));

    await mount(signedIn());
    await press();

    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(error()).toContain("Bewaren is niet gelukt");
  });

  it("says the session ended when the write comes back unauthenticated", async () => {
    /*
     * The case the plan asks to decide: the cookie expired while the page
     * sat open. The header still shows the account the page was rendered
     * with, so without this the press looks like it worked and the
     * favourite is nowhere. The message is separate from the generic
     * failure because the remedy is: sign in again.
     */
    vi.stubGlobal("fetch", respondWith({ error: "signed-out" }, 401));

    await mount(signedIn());
    await press();

    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(error()).toContain("Je sessie is verlopen");
    expect(
      container
        .querySelector('[data-testid="favorite-error"] a')
        ?.getAttribute("href")
    ).toBe("/nl/sign-in");
  });

  it("does not blame the session for an ordinary failure", async () => {
    // The two messages have to be distinguishable, or the split buys
    // nothing: "sign in again" is useless advice to somebody whose session
    // is fine.
    vi.stubGlobal("fetch", respondWith({}, 500));

    await mount(signedIn());
    await press();

    expect(error()).not.toContain("Je sessie is verlopen");
  });

  it("survives a write that never answers at all", async () => {
    // `fetch` rejects on a dropped connection. An unhandled rejection inside
    // an event handler is a console error at best and an unhandled promise
    // at worst; either way the heart must stay where it was.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await mount(signedIn());
    await press();

    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(error()).toContain("Bewaren is niet gelukt");
  });

  it("refuses a second press while the first is still in flight", async () => {
    /*
     * A double press would otherwise send "favourite" and "un-favourite"
     * within a few milliseconds of each other, and with no transactions and
     * no ordering guarantee the account ends up in whichever state the
     * slower request decided. The control is disabled while it waits.
     */
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => undefined));
    vi.stubGlobal("fetch", fetchMock);

    await mount(signedIn());
    await press();

    expect(button().disabled).toBe(true);
    expect(button().getAttribute("aria-busy")).toBe("true");

    await press();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears a previous failure when a later press succeeds", async () => {
    vi.stubGlobal("fetch", respondWith({}, 500));

    await mount(signedIn());
    await press();

    expect(error()).not.toBeNull();

    vi.stubGlobal("fetch", respondWith({ favorite: true }));
    await press();

    expect(error()).toBeNull();
    expect(button().getAttribute("aria-pressed")).toBe("true");
  });

  it("never reads the guest store on the account path", async () => {
    /*
     * The mode switch from the other side, and the assertion that catches a
     * mutation forcing it to `localStorage`: the account path must not read
     * the browser's list at all, not even to ignore it.
     */
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    vi.stubGlobal("fetch", respondWith({ favorite: true }));

    await mount(signedIn());
    await press();

    expect(getItem).not.toHaveBeenCalled();
  });
});
