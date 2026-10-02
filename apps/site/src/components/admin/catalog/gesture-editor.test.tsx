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
const DESCRIPTION = /Description/;

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

  /** A fake `update`: stale for the old version, else the saved row. */
  function staleThenSaved(fresh: () => AdminGestureDetail) {
    return (input: unknown) => {
      const {
        expectedUpdatedAt,
        id: _id,
        ...patch
      } = input as {
        expectedUpdatedAt: number;
        id: string;
      };
      return expectedUpdatedAt === 1000
        ? rpcError("CONFLICT", 409, { ids: ["g1"], reason: "stale" })
        : { ...fresh(), ...patch, updatedAt: 2000 };
    };
  }

  function updates(calls: { input: unknown; path: string }[]): unknown[] {
    return calls
      .filter((call) => call.path === "admin/gestures/update")
      .map((call) => call.input);
  }

  function renderEditor(api: Record<string, unknown>) {
    return renderSite(
      () => (
        <div data-testid="page">
          <GestureEditor gesture={detail()} />
        </div>
      ),
      { api: { ...BASE_API, ...api } }
    );
  }

  test("a stale save keeps their other fields: only my rename goes out (the review's probe)", async () => {
    // B changed the description and the keywords meanwhile.
    const fresh = () =>
      detail({
        description: "Van B",
        keywords: ["hallo", "dag"],
        updatedAt: 1500,
      });
    const { calls } = await renderEditor({
      "admin/gestures/get": fresh,
      "admin/gestures/update": staleThenSaved(fresh),
    });
    fireEvent.change(nameInput(), { target: { value: "Mijn naam" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updates(calls)).toHaveLength(2));
    expect(updates(calls)[1]).toEqual({
      expectedUpdatedAt: 1500,
      id: "g1",
      name: "Mijn naam",
    });
    expect(
      await screen.findByText("Merged with a newer version and saved.")
    ).toBeDefined();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      (screen.getByRole("textbox", { name: DESCRIPTION }) as HTMLElement)
        .textContent
    ).toBe("Van B");
  });

  test("a stale save never republishes what they unpublished", async () => {
    const fresh = () => detail({ publishedAt: null, updatedAt: 1500 });
    const { calls } = await renderEditor({
      "admin/gestures/get": fresh,
      "admin/gestures/setPublished": detail(),
      "admin/gestures/update": staleThenSaved(fresh),
    });
    fireEvent.change(nameInput(), { target: { value: "Mijn naam" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updates(calls)).toHaveLength(2));
    expect(updates(calls)[1]).toEqual({
      expectedUpdatedAt: 1500,
      id: "g1",
      name: "Mijn naam",
    });
    expect(
      calls.some((call) => call.path === "admin/gestures/setPublished")
    ).toBe(false);
    await waitFor(() =>
      expect(
        screen
          .getByRole("switch", { name: "Published" })
          .getAttribute("aria-checked")
      ).toBe("false")
    );
  });

  test("both renamed: the diff dialog; Escape changes nothing, their version is the default", async () => {
    const fresh = () => detail({ name: "Naam van B", updatedAt: 1500 });
    const { calls } = await renderEditor({
      "admin/gestures/get": fresh,
      "admin/gestures/update": staleThenSaved(fresh),
    });
    fireEvent.change(nameInput(), { target: { value: "Mijn naam" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Someone else changed this gesture",
    });
    const diff = within(dialog).getByRole("table", { name: "Name" });
    expect(within(diff).getByText("Naam van B")).toBeDefined();
    expect(within(diff).getByText("Mijn naam")).toBeDefined();
    // Their version is the focused default.
    expect(document.activeElement?.textContent).toBe("Use their version");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(nameInput().value).toBe("Mijn naam");
    expect(updates(calls)).toHaveLength(1);

    // Escape armed nothing: the next save conflicts again.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const again = await screen.findByRole("dialog", {
      name: "Someone else changed this gesture",
    });
    expect(updates(calls)).toHaveLength(2);
    fireEvent.click(
      within(again).getByRole("button", { name: "Use their version" })
    );
    await waitFor(() => expect(nameInput().value).toBe("Naam van B"));
    expect(updates(calls)).toHaveLength(2);
  });

  test("overwrite with mine needs a second confirmation that names the fields", async () => {
    const fresh = () => detail({ name: "Naam van B", updatedAt: 1500 });
    const { calls } = await renderEditor({
      "admin/gestures/get": fresh,
      "admin/gestures/update": staleThenSaved(fresh),
    });
    fireEvent.change(nameInput(), { target: { value: "Mijn naam" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Someone else changed this gesture",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Overwrite with mine" })
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: "Overwrite their changes?",
    });
    expect(confirm.textContent).toContain(
      "This replaces the other admin's name with yours."
    );
    expect(updates(calls)).toHaveLength(1);
    fireEvent.click(within(confirm).getByRole("button", { name: "Overwrite" }));
    await waitFor(() => expect(updates(calls)).toHaveLength(2));
    expect(updates(calls)[1]).toEqual({
      expectedUpdatedAt: 1500,
      id: "g1",
      name: "Mijn naam",
    });
  });

  test("a failed publish after a saved rename never conflicts with itself", async () => {
    let publishCalls = 0;
    const { calls } = await renderEditor({
      "admin/gestures/get": detail(),
      "admin/gestures/setPublished": () => {
        publishCalls += 1;
        return publishCalls === 1
          ? rpcError("INTERNAL_SERVER_ERROR", 500)
          : detail({ name: "Mijn naam", publishedAt: null, updatedAt: 3000 });
      },
      "admin/gestures/update": detail({ name: "Mijn naam", updatedAt: 2000 }),
    });
    fireEvent.change(nameInput(), { target: { value: "Mijn naam" } });
    fireEvent.click(screen.getByRole("switch", { name: "Published" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(publishCalls).toBe(1));
    expect(
      await screen.findByText("The changes could not be saved.")
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(publishCalls).toBe(2));
    // The rename is not sent again, and nothing conflicts.
    expect(updates(calls)).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("leaving with unsaved edits asks first; a clean editor lets go", async () => {
    const { router } = await renderEditor({
      "admin/gestures/get": detail(),
    });
    fireEvent.change(nameInput(), { target: { value: "Niet bewaard" } });
    router.navigate({ to: "/elders" as never }).catch(() => undefined);
    const ask = await screen.findByRole("alertdialog", {
      name: "Leave without saving?",
    });
    fireEvent.click(within(ask).getByRole("button", { name: "Stay" }));
    expect(router.state.location.pathname).toBe("/");
  });

  test("a clean editor never asks", async () => {
    const { router } = await renderEditor({
      "admin/gestures/get": detail(),
    });
    await router.navigate({ to: "/elders" as never });
    expect(router.state.location.pathname).toBe("/elders");
    expect(screen.queryByRole("alertdialog")).toBeNull();
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
