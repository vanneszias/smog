import { describe, expect, test } from "bun:test";
import type { AdminCategory, AdminGestureRow } from "@smog/admin/schema";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { renderSite, rpcError } from "@/test/render";
import { GestureTableEditor } from "./gesture-table-editor";
import type { TableEdits } from "./table-edits";

/*
 * The table editor (A-20) over a fake API: edits stay buffered with
 * "Discard (N)", the confirm dialog shows old and new per field, and one
 * `saveMany` saves them. A stale save is merged with their newer rows
 * (C1): a field only they changed stays theirs, one only I changed is sent
 * again; one we both changed is a conflict with "Use their version" or
 * "Overwrite with mine". Invalid cells and more than 50 rows block a save;
 * Escape restores a cell.
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

function row(
  id: string,
  name: string,
  overrides: Partial<AdminGestureRow> = {}
): AdminGestureRow {
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
    ...overrides,
  };
}

const DISCARD = /Discard \(/;

/** A stable refresh that answers the newer rows. */
function freshRows(rows: AdminGestureRow[]): () => Promise<AdminGestureRow[]> {
  return () => Promise.resolve(rows);
}
const ROWS = [row("g1", "Zwaaien"), row("g2", "Knikken")];

function noop(): void {
  // The test never leaves the editor.
}

/** The list page owns the buffer; the harness does too. */
function Harness({
  refresh = async () => ROWS,
  rows = ROWS,
}: {
  refresh?: () => Promise<AdminGestureRow[]>;
  rows?: AdminGestureRow[];
}): ReactNode {
  const [edits, setEdits] = useState<TableEdits>(() => new Map());
  return (
    <div data-testid="page">
      <GestureTableEditor
        categories={CATEGORIES}
        edits={edits}
        onEditsChange={setEdits}
        onRefresh={refresh}
        onStop={noop}
        rows={rows}
      />
    </div>
  );
}

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

function saves(calls: { input: unknown; path: string }[]): unknown[] {
  return calls
    .filter((call) => call.path === "admin/gestures/saveMany")
    .map((call) => call.input);
}

async function reviewAndSave(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Review your changes",
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
}

describe("GestureTableEditor", () => {
  test("buffers edits, shows the diff, then saves them in one call", async () => {
    const { calls } = await renderSite(() => <Harness />, {
      api: { "admin/gestures/saveMany": { items: [] } },
    });
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
    expect(saves(calls)).toEqual([]);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" })
    );
    await waitFor(() => expect(saves(calls)).toHaveLength(1));
    expect(saves(calls)[0]).toEqual({
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
    // Focus lands on the editor's heading, not on <body>.
    expect(document.activeElement?.textContent).toBe("Table editor");
  });

  test("a multi-line description keeps its line breaks", async () => {
    const { calls } = await renderSite(() => <Harness />, {
      api: { "admin/gestures/saveMany": { items: [] } },
    });
    const description = cell("Description", "Zwaaien");
    expect(description.tagName).toBe("TEXTAREA");
    expect(description.getAttribute("maxlength")).toBe("2000");
    expect(cell("Name", "Zwaaien").getAttribute("maxlength")).toBe("120");
    fireEvent.change(description, { target: { value: "Een\nTwee" } });
    await reviewAndSave();
    await waitFor(() => expect(saves(calls)).toHaveLength(1));
    expect(saves(calls)[0]).toEqual({
      items: [
        {
          expectedUpdatedAt: 100,
          id: "g1",
          patch: { description: "Een\nTwee" },
        },
      ],
    });
  });

  test("a typed playback id clears the old Mux asset", async () => {
    const { calls } = await renderSite(
      () => (
        <Harness rows={[row("g1", "Zwaaien", { muxAssetId: "asset-1" })]} />
      ),
      { api: { "admin/gestures/saveMany": { items: [] } } }
    );
    fireEvent.change(cell("Playback ID", "Zwaaien"), {
      target: { value: "pb-nieuw" },
    });
    await reviewAndSave();
    await waitFor(() => expect(saves(calls)).toHaveLength(1));
    expect(saves(calls)[0]).toEqual({
      items: [
        {
          expectedUpdatedAt: 100,
          id: "g1",
          patch: { muxAssetId: null, playbackId: "pb-nieuw" },
        },
      ],
    });
  });

  test("discard asks first for more than one row, and drops every edit", async () => {
    await renderSite(() => <Harness />);
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Discard (2)" }));
    const ask = await screen.findByRole("alertdialog", {
      name: "Discard 2 changes?",
    });
    fireEvent.click(within(ask).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(cell("Name", "Zwaaien").value).toBe("Zwaaien"));
    expect(screen.queryByRole("button", { name: DISCARD })).toBeNull();
  });

  test("Escape restores a cell; an invalid cell says why and blocks the save", async () => {
    await renderSite(() => <Harness />);
    const name = cell("Name", "Zwaaien");
    fireEvent.change(name, { target: { value: "Iets" } });
    fireEvent.keyDown(name, { key: "Escape" });
    expect(cell("Name", "Zwaaien").value).toBe("Zwaaien");
    fireEvent.change(cell("Playback ID", "Knikken"), {
      target: { value: "geen id!" },
    });
    const invalid = cell("Playback ID", "Knikken");
    expect(invalid.getAttribute("aria-invalid")).toBe("true");
    const described = (invalid.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    expect(described).toContain(
      "A playback ID consists of letters, digits, _ and -."
    );
    expect(
      screen
        .getByRole("button", { name: "Save changes" })
        .hasAttribute("disabled")
    ).toBe(true);
  });

  test("more than 50 changed rows block the save", async () => {
    const many = Array.from({ length: 51 }, (_, index) =>
      row(`g${index}`, `Gebaar ${index}`)
    );
    await renderSite(() => <Harness rows={many} />);
    for (const item of many) {
      fireEvent.change(cell("Name", item.name), {
        target: { value: `${item.name}!` },
      });
    }
    expect(screen.getByText("Save at most 50 gestures at once.")).toBeDefined();
    expect(
      screen
        .getByRole("button", { name: "Save changes" })
        .hasAttribute("disabled")
    ).toBe(true);
  });

  test("a stale save keeps their other fields and sends only mine again", async () => {
    // B changed g1's description meanwhile; A renamed g1.
    const fresh = [
      row("g1", "Zwaaien", { description: "Van B", updatedAt: 200 }),
      ROWS[1] as AdminGestureRow,
    ];
    const { calls } = await renderSite(
      () => <Harness refresh={freshRows(fresh)} />,
      {
        api: {
          "admin/gestures/saveMany": (input: unknown) =>
            (input as { items: { expectedUpdatedAt: number }[] }).items.some(
              (item) => item.expectedUpdatedAt === 100
            )
              ? rpcError("CONFLICT", 409, { ids: ["g1"], reason: "stale" })
              : { items: [] },
        },
      }
    );
    fireEvent.change(cell("Name", "Zwaaien"), { target: { value: "Wuiven" } });
    await reviewAndSave();
    expect(
      await screen.findByText(
        "Merged with newer versions. Check the changes and save again."
      )
    ).toBeDefined();
    expect(cell("Description", "Zwaaien").value).toBe("Van B");
    await reviewAndSave();
    await waitFor(() => expect(saves(calls)).toHaveLength(2));
    expect(saves(calls)[1]).toEqual({
      items: [{ expectedUpdatedAt: 200, id: "g1", patch: { name: "Wuiven" } }],
    });
  });

  async function bothRenamed() {
    // B renamed g1 meanwhile; A renames it too, and edits g2.
    const fresh = [
      row("g1", "Zwaaien door B", { updatedAt: 200 }),
      ROWS[1] as AdminGestureRow,
    ];
    const site = await renderSite(
      () => <Harness refresh={freshRows(fresh)} />,
      {
        api: {
          "admin/gestures/saveMany": (input: unknown) =>
            (
              input as { items: { expectedUpdatedAt: number; id: string }[] }
            ).items.some(
              (item) => item.id === "g1" && item.expectedUpdatedAt === 100
            )
              ? rpcError("CONFLICT", 409, { ids: ["g1"], reason: "stale" })
              : { items: [] },
        },
      }
    );
    edit();
    await reviewAndSave();
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain(
      "Another admin changed the same fields of 1 gesture."
    );
    expect(document.querySelectorAll('tr[data-stale="true"]')).toHaveLength(1);
    // Nothing is lost before the admin chooses.
    expect(screen.getByRole("button", { name: "Discard (2)" })).toBeDefined();
    return { banner, calls: site.calls };
  }

  test("a field both changed: Use their version drops only that edit", async () => {
    const { banner, calls } = await bothRenamed();
    fireEvent.click(
      within(banner).getByRole("button", { name: "Use their version" })
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Discard (1)" })).toBeDefined()
    );
    expect(cell("Description", "Knikken").value).toBe("Ja zeggen");
    expect(document.querySelector('tr[data-stale="true"]')).toBeNull();
    expect(saves(calls)).toHaveLength(1);
  });

  test("a field both changed: Overwrite with mine asks again, naming the fields", async () => {
    const { banner, calls } = await bothRenamed();
    fireEvent.click(
      within(banner).getByRole("button", { name: "Overwrite with mine" })
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: "Overwrite their changes?",
    });
    expect(confirm.textContent).toContain("Zwaaien door B: name");
    expect(saves(calls)).toHaveLength(1);
    fireEvent.click(within(confirm).getByRole("button", { name: "Overwrite" }));
    await waitFor(() => expect(saves(calls)).toHaveLength(2));
    expect(saves(calls)[1]).toEqual({
      items: [
        { expectedUpdatedAt: 200, id: "g1", patch: { name: "Wuiven" } },
        {
          expectedUpdatedAt: 100,
          id: "g2",
          patch: { description: "Ja zeggen" },
        },
      ],
    });
  });
});
