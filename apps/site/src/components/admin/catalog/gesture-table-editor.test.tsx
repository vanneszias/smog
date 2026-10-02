import { describe, expect, test } from "bun:test";
import type { AdminCategory, AdminGestureRow } from "@smog/admin/schema";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderSite, rpcError } from "@/test/render";
import { GestureTableEditor } from "./gesture-table-editor";

/*
 * The table editor (A-20) over a fake API: edits stay buffered with
 * "Discard (N)", the confirm dialog shows old and new per field, one
 * `saveMany` saves them, and a stale row is highlighted with "Reload these
 * rows" while the other edits stay.
 */

const CATEGORIES: AdminCategory[] = [
  {
    gestureCount: 2,
    id: "c1",
    name: "Begroeten",
    publishedAt: 1,
    publishedGestureCount: 2,
    slug: "begroeten",
    sortOrder: 0,
    updatedAt: 1,
  },
];

function row(id: string, name: string): AdminGestureRow {
  return {
    categories: [
      { id: "c1", name: "Begroeten", published: true, slug: "begroeten" },
    ],
    description: "",
    id,
    keywords: [],
    muxAssetId: null,
    name,
    playbackId: `pb-${id}`,
    publishedAt: 1,
    slug: name.toLowerCase(),
    updatedAt: 100,
  };
}

const DISCARD = /Discard \(/;

function noop(): void {
  // The test never leaves the editor.
}

const ROWS = [row("g1", "Zwaaien"), row("g2", "Knikken")];

function cell(field: string, name: string): HTMLInputElement {
  return screen.getByRole("textbox", {
    name: `${field} of ${name}`,
  }) as HTMLInputElement;
}

function edit(): void {
  fireEvent.change(cell("Name", "Zwaaien"), { target: { value: "Wuiven" } });
  fireEvent.change(cell("Description", "Knikken"), {
    target: { value: "Ja zeggen" },
  });
}

describe("GestureTableEditor", () => {
  test("buffers edits, shows the diff, then saves them in one call", async () => {
    const { calls } = await renderSite(
      () => (
        <div data-testid="page">
          <GestureTableEditor
            categories={CATEGORIES}
            onStop={noop}
            rows={ROWS}
          />
        </div>
      ),
      { api: { "admin/gestures/saveMany": { items: [] } } }
    );
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save.hasAttribute("disabled")).toBe(true);
    edit();
    expect(screen.getByRole("button", { name: "Discard (2)" })).toBeDefined();
    fireEvent.click(save);
    const dialog = await screen.findByRole("dialog", {
      name: "Review your changes",
    });
    const zwaaien = within(dialog).getByRole("table", { name: "Zwaaien" });
    expect(within(zwaaien).getByText("Wuiven")).toBeDefined();
    const knikken = within(dialog).getByRole("table", { name: "Knikken" });
    expect(within(knikken).getByText("(empty)")).toBeDefined();
    expect(within(knikken).getByText("Ja zeggen")).toBeDefined();
    expect(calls.some((call) => call.path === "admin/gestures/saveMany")).toBe(
      false
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" })
    );
    await waitFor(() =>
      expect(
        calls.filter((call) => call.path === "admin/gestures/saveMany")
      ).toHaveLength(1)
    );
    expect(
      calls.find((call) => call.path === "admin/gestures/saveMany")?.input
    ).toEqual({
      items: [
        { expectedUpdatedAt: 100, id: "g1", patch: { name: "Wuiven" } },
        {
          expectedUpdatedAt: 100,
          id: "g2",
          patch: { description: "Ja zeggen" },
        },
      ],
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: DISCARD })).toBeNull()
    );
  });

  test("discard drops every buffered edit", async () => {
    await renderSite(() => (
      <div data-testid="page">
        <GestureTableEditor categories={CATEGORIES} onStop={noop} rows={ROWS} />
      </div>
    ));
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Discard (2)" }));
    expect(cell("Name", "Zwaaien").value).toBe("Zwaaien");
  });

  test("a stale row is highlighted and reloaded; the other edits stay", async () => {
    await renderSite(
      () => (
        <div data-testid="page">
          <GestureTableEditor
            categories={CATEGORIES}
            onStop={noop}
            rows={ROWS}
          />
        </div>
      ),
      {
        api: {
          "admin/gestures/saveMany": () =>
            rpcError("CONFLICT", 409, { ids: ["g1"], reason: "stale" }),
        },
      }
    );
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Review your changes",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" })
    );
    const reload = await screen.findByRole("button", {
      name: "Reload these rows",
    });
    const stale = document.querySelector('tr[data-stale="true"]');
    expect(stale?.textContent).toContain("Changed by another admin");
    expect(document.querySelectorAll('tr[data-stale="true"]')).toHaveLength(1);
    // Nothing is lost before the admin chooses.
    expect(screen.getByRole("button", { name: "Discard (2)" })).toBeDefined();
    fireEvent.click(reload);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Discard (1)" })).toBeDefined()
    );
    expect(cell("Name", "Zwaaien").value).toBe("Zwaaien");
    expect(cell("Description", "Knikken").value).toBe("Ja zeggen");
    expect(document.querySelector('tr[data-stale="true"]')).toBeNull();
  });
});
