import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GUEST_FAVORITES_KEY } from "@/lib/guestStore";
import { GuestFavoritesSync } from "./GuestFavoritesSync";

/*
 * Rendered with `react-dom/client` and React's own `act`, for the reason
 * `FavoriteButton.test.tsx` gives: `@testing-library/react` is hoisted into
 * the root `node_modules` by `@smog/ui-web`, so importing it here would work
 * and then fail `knip` as an unlisted dependency.
 */
let container: HTMLDivElement;
let root: Root;

describe("GuestFavoritesSync", () => {
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

  const mount = async () => {
    await act(async () => {
      root.render(<GuestFavoritesSync />);
    });
  };

  const okResponse = (favorites: string[]) =>
    new Response(JSON.stringify({ favorites }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  it("renders nothing at all", async () => {
    await mount();

    /*
     * Asserted on the real container rather than on the return value,
     * because "renders null" is a claim about what reaches the page. A
     * component that rendered a stray wrapper div would put an empty
     * element between the header and `<main>` in the layout of every
     * signed-in page.
     */
    expect(container.innerHTML).toBe("");
  });

  it("adds nothing to the server-rendered markup either", () => {
    // The layout is a server component, so this component is server-rendered
    // before it ever hydrates. An empty string here is what keeps it from
    // changing the document every page ships.
    expect(renderToStaticMarkup(<GuestFavoritesSync />)).toBe("");
  });

  it("merges this browser's guest favorites on mount", async () => {
    window.localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(["7"]));

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse(["7"]));

    await mount();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [path, init] = fetchMock.mock.calls[0];

    expect(path).toBe("/account/merge-favorites");
    expect(JSON.parse(String(init?.body))).toEqual({ ids: ["7"] });

    // The whole point of the merge: the local copy is gone once the account
    // has it. Asserted here and not only in `mergeGuestState.test.ts`
    // because this component is what makes it happen after a sign-in.
    expect(window.localStorage.getItem(GUEST_FAVORITES_KEY)).toBeNull();
  });

  it("makes no request when this browser has no guest favorites", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await mount();

    /*
     * This is the case for almost every reader on almost every page — the
     * component is in the layout, so it mounts on all of them. A request
     * here would be one per signed-in page view for the whole site.
     */
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the guest favorites when the merge is refused", async () => {
    window.localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(["7"]));

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      // A readable body, so this proves the `ok` check and not the narrowing
      // one line below it — the distinction that made an earlier version of
      // the equivalent test in `mergeGuestState.test.ts` vacuous.
      new Response(JSON.stringify({ favorites: [] }), {
        headers: { "Content-Type": "application/json" },
        status: 401,
      })
    );

    await mount();

    expect(window.localStorage.getItem(GUEST_FAVORITES_KEY)).toBe(
      JSON.stringify(["7"])
    );
  });

  it("does not throw out of the effect when the merge fails", async () => {
    window.localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(["7"]));
    vi.spyOn(console, "error").mockImplementation(() => {
      // The failure is logged by `syncGuestFavorites`; silenced, not asserted.
    });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    /*
     * An effect that throws during mount is an unhandled error in the client
     * tree, and React unmounts up to the nearest boundary — which, for a
     * component in the layout, blanks every page rather than one control.
     * That is why this is asserted at the component and not left to
     * `syncGuestFavorites`'s own never-throws test.
     */
    await expect(mount()).resolves.toBeUndefined();
    expect(container.innerHTML).toBe("");
  });
});
