import { describe, expect, mock, test } from "bun:test";
import type { AdminCategory, AdminGestureDetail } from "@smog/admin/schema";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";

// mux-player needs a real browser.
mock.module("@mux/mux-player-react", () => ({
  default: (): ReactNode => <div data-testid="mux" />,
}));

const { renderSite, rpcError } = await import("@/test/render");
const { GestureEditor } = await import("./gesture-editor");

/*
 * The gesture editor (A-16, A-17) over a fake API: the live duplicate-name
 * warning, create with a pasted playback id, a save with only the changed
 * fields and `expectedUpdatedAt`, and the stale-save conflict dialog
 * ("Reload (lose my edits)" / "Keep editing").
 */

function category(id: string, name: string, published = true): AdminCategory {
  return {
    gestureCount: 1,
    id,
    name,
    publishedAt: published ? 1 : null,
    publishedGestureCount: 1,
    slug: name.toLowerCase(),
    sortOrder: 0,
    updatedAt: 1,
  };
}

const CATEGORIES = [
  category("c1", "Begroeten"),
  category("c2", "Dieren", false),
];

function detail(overrides: Partial<AdminGestureDetail> = {}) {
  return {
    categories: [
      { id: "c1", name: "Begroeten", published: true, slug: "begroeten" },
    ],
    createdAt: 1,
    description: "Zwaai met je hand.",
    id: "g1",
    keywords: ["hallo"],
    muxAssetId: null,
    name: "Zwaaien",
    playbackId: "pb-zwaaien",
    publishedAt: 1,
    slug: "zwaaien",
    updatedAt: 1000,
    ...overrides,
  } satisfies AdminGestureDetail;
}

function nameInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
}

const DIEREN = /Dieren/;

const BASE_API = {
  "admin/categories/list": CATEGORIES,
  "admin/gestures/checkName": { duplicates: [] },
  "admin/mux/status": { configured: false },
};

describe("GestureEditor", () => {
  test("warns about a duplicate name after a pause, and counts characters", async () => {
    const { calls } = await renderSite(
      () => (
        <div data-testid="page">
          <GestureEditor gesture={null} />
        </div>
      ),
      {
        api: {
          ...BASE_API,
          "admin/gestures/checkName": (input: unknown) =>
            (input as { name: string }).name === "Hond"
              ? { duplicates: [{ id: "g9", name: "Hond", slug: "hond" }] }
              : { duplicates: [] },
        },
      }
    );
    fireEvent.change(nameInput(), { target: { value: "Hon" } });
    fireEvent.change(nameInput(), { target: { value: "Hond" } });
    expect(screen.getByText("4/120")).toBeDefined();
    const warning = await screen.findByRole("status", {
      name: "Possible duplicate",
    });
    expect(within(warning).getByRole("link", { name: "Hond" })).toBeDefined();
    // Debounced: one check for the settled name only.
    expect(
      calls
        .filter((call) => call.path === "admin/gestures/checkName")
        .map((call) => call.input)
    ).toEqual([{ name: "Hond" }]);
  });

  test("creates with a pasted playback id, published by default", async () => {
    const created = detail({ id: "g-new", name: "Kat", slug: "kat" });
    const { calls } = await renderSite(
      () => (
        <div data-testid="page">
          <GestureEditor gesture={null} />
        </div>
      ),
      { api: { ...BASE_API, "admin/gestures/create": created } }
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Create gesture" })
    );
    expect(await screen.findByText("Enter a name.")).toBeDefined();
    expect(screen.getByText("Choose a video.")).toBeDefined();
    expect(screen.getByText("Choose at least one category.")).toBeDefined();

    fireEvent.change(nameInput(), { target: { value: " Kat " } });
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Playback ID" }),
      { target: { value: "pb-kat" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Use this video" }));
    fireEvent.click(await screen.findByRole("button", { name: DIEREN }));
    expect(
      (
        screen.getByRole("switch", { name: "Published" }) as HTMLElement
      ).getAttribute("aria-checked")
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Create gesture" }));
    await waitFor(() =>
      expect(
        calls.find((call) => call.path === "admin/gestures/create")?.input
      ).toEqual({
        categoryIds: ["c2"],
        description: "",
        keywords: [],
        name: "Kat",
        playbackId: "pb-kat",
        published: true,
      })
    );
  });

  test("saves only the changed fields with expectedUpdatedAt", async () => {
    const { calls } = await renderSite(
      () => (
        <div data-testid="page">
          <GestureEditor gesture={detail()} />
        </div>
      ),
      {
        api: {
          ...BASE_API,
          "admin/gestures/get": detail(),
          "admin/gestures/update": detail({ name: "Wuiven", updatedAt: 2000 }),
        },
      }
    );
    expect(screen.getByText("zwaaien")).toBeDefined();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.change(nameInput(), { target: { value: "Wuiven" } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(
        calls.find((call) => call.path === "admin/gestures/update")?.input
      ).toEqual({ expectedUpdatedAt: 1000, id: "g1", name: "Wuiven" })
    );
    // Saved: nothing is dirty again.
    await waitFor(() => expect(save.hasAttribute("disabled")).toBe(true));
  });

  test("a stale save offers to reload or keep editing", async () => {
    let fresh = detail();
    const { calls } = await renderSite(
      () => (
        <div data-testid="page">
          <GestureEditor gesture={detail()} />
        </div>
      ),
      {
        api: {
          ...BASE_API,
          "admin/gestures/get": () => fresh,
          "admin/gestures/update": () =>
            rpcError("CONFLICT", 409, { ids: ["g1"], reason: "stale" }),
        },
      }
    );
    // Another admin renames it meanwhile.
    fresh = detail({ name: "Zwaaien (nieuw)", updatedAt: 1500 });
    fireEvent.change(nameInput(), { target: { value: "Mijn naam" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Someone else changed this gesture",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep editing" })
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(nameInput().value).toBe("Mijn naam");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const again = await screen.findByRole("alertdialog", {
      name: "Someone else changed this gesture",
    });
    fireEvent.click(
      within(again).getByRole("button", { name: "Reload (lose my edits)" })
    );
    await waitFor(() => expect(nameInput().value).toBe("Zwaaien (nieuw)"));
    const updates = calls.filter(
      (call) => call.path === "admin/gestures/update"
    );
    // "Keep editing" saves against the version it was shown.
    expect(
      updates.map(
        (call) =>
          (call.input as { expectedUpdatedAt: number }).expectedUpdatedAt
      )
    ).toEqual([1000, 1500]);
  });

  test("delete is offered for a hidden gesture after typing its name", async () => {
    const { calls } = await renderSite(
      () => (
        <div data-testid="page">
          <GestureEditor gesture={detail({ publishedAt: null })} />
        </div>
      ),
      {
        api: {
          ...BASE_API,
          "admin/gestures/delete": { id: "g1" },
          "admin/gestures/get": detail({ publishedAt: null }),
        },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete gesture" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete Zwaaien?",
    });
    const confirm = within(dialog).getByRole("button", { name: "Delete" });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "Zwaaien" },
    });
    expect(confirm.hasAttribute("disabled")).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(
        calls.find((call) => call.path === "admin/gestures/delete")?.input
      ).toEqual({ confirmName: "Zwaaien", id: "g1" })
    );
  });

  test("a published gesture shows View on site and no delete", async () => {
    await renderSite(
      () => (
        <div data-testid="page">
          <GestureEditor gesture={detail()} />
        </div>
      ),
      { api: { ...BASE_API, "admin/gestures/get": detail() } }
    );
    expect(
      screen.getByRole("link", { name: "View on site" }).getAttribute("href")
    ).toBe("/gestures/zwaaien");
    expect(screen.queryByRole("button", { name: "Delete gesture" })).toBeNull();
    expect(
      screen.getByText("Unpublish the gesture first to delete it.")
    ).toBeDefined();
  });
});
