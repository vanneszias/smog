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
  localStorage.clear();
});

describe("FavoriteButton", () => {
  it("renders unpressed when the gesture is not favourited", async () => {
    await mount(<FavoriteButton gestureId="7" />);

    expect(button().getAttribute("aria-pressed")).toBe("false");
  });

  it("renders pressed when the gesture is already favourited", async () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '["7"]');

    await mount(<FavoriteButton gestureId="7" />);

    expect(button().getAttribute("aria-pressed")).toBe("true");
  });

  it("ignores a stored favorite for a different gesture", async () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '["8"]');

    await mount(<FavoriteButton gestureId="7" />);

    expect(button().getAttribute("aria-pressed")).toBe("false");
  });

  it("stores the gesture when pressed", async () => {
    await mount(<FavoriteButton gestureId="7" />);
    await press();

    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem(GUEST_FAVORITES_KEY)).toBe('["7"]');
  });

  it("removes the gesture when pressed again", async () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '["7"]');

    await mount(<FavoriteButton gestureId="7" />);
    await press();

    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(localStorage.getItem(GUEST_FAVORITES_KEY)).toBe("[]");
  });

  it("keeps one accessible name in both states", async () => {
    // Relabelling a toggle between "add" and "remove" reads as a different
    // control each time it is pressed. `aria-pressed` carries the state;
    // the name stays put. Same rule as `GestureCard`'s own control.
    await mount(<FavoriteButton gestureId="7" />);

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

    await mount(<FavoriteButton gestureId="7" />);

    expect(button().getAttribute("aria-pressed")).toBe("false");
  });

  it("still reflects the press when the write is refused", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    await mount(<FavoriteButton gestureId="7" />);
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
    const markup = renderToStaticMarkup(<FavoriteButton gestureId="7" />);

    expect(markup).not.toContain("data-ready");
    expect(markup).toContain('aria-pressed="false"');
  });

  it("marks itself ready once it has read the store", async () => {
    await mount(<FavoriteButton gestureId="7" />);

    expect(button().getAttribute("data-ready")).toBe("true");
  });

  it("marks itself ready even when the store is denied", async () => {
    // A reader in a private window still gets a working control for the
    // rest of their visit; it just cannot remember anything afterwards.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    await mount(<FavoriteButton gestureId="7" />);

    expect(button().getAttribute("data-ready")).toBe("true");
  });

  it("does not submit a form it happens to sit inside", async () => {
    // The detail page has no form today, but `Button` defaults `type` for
    // exactly this reason and a favourite control that submits its
    // surroundings is a silent, destructive failure.
    await mount(<FavoriteButton gestureId="7" />);

    expect(button().getAttribute("type")).toBe("button");
  });
});
