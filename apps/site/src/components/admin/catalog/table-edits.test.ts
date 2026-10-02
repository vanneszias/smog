import { describe, expect, test } from "bun:test";
import type { AdminGestureRow } from "@smog/admin/schema";
import {
  changesOf,
  editedValues,
  invalidFields,
  rebaseEdits,
  resolveConflicts,
  saveManyItems,
  setEdit,
  type TableEdits,
} from "./table-edits";

function row(id: string, overrides: Partial<AdminGestureRow> = {}) {
  return {
    categories: [
      { id: "c1", name: "Begroeten", published: true, slug: "begroeten" },
    ],
    description: "",
    id,
    keywords: ["hallo"],
    muxAssetId: null,
    name: `Gebaar ${id}`,
    playbackId: `pb-${id}`,
    publishedAt: 1,
    slug: `gebaar-${id}`,
    updatedAt: 100,
    ...overrides,
  } satisfies AdminGestureRow;
}

const JOIN = (items: readonly string[]): string => items.join(", ");

const NAMES = new Map([
  ["c1", "Begroeten"],
  ["c2", "Dieren"],
]);

describe("the table editor's buffer", () => {
  test("buffers a changed field against the row as first read", () => {
    const one = row("1");
    let edits: TableEdits = new Map();
    edits = setEdit(edits, one, "name", "Hallo");
    // A refetch with a newer row does not move the base.
    edits = setEdit(edits, { ...one, updatedAt: 200 }, "description", "Uitleg");
    expect(editedValues(edits, one).name).toBe("Hallo");
    expect(edits.get("1")?.base.updatedAt).toBe(100);
    expect(saveManyItems(edits)).toEqual([
      {
        expectedUpdatedAt: 100,
        id: "1",
        patch: { description: "Uitleg", name: "Hallo" },
      },
    ]);
  });

  test("forgets a field set back to its value, and a row with no change", () => {
    const one = row("1");
    let edits: TableEdits = setEdit(new Map(), one, "name", "Hallo");
    edits = setEdit(edits, one, "keywords", ["hallo", "dag"]);
    edits = setEdit(edits, one, "name", one.name);
    expect(saveManyItems(edits)).toEqual([
      {
        expectedUpdatedAt: 100,
        id: "1",
        patch: { keywords: ["hallo", "dag"] },
      },
    ]);
    edits = setEdit(edits, one, "keywords", ["hallo"]);
    expect(edits.size).toBe(0);
  });

  test("compares categories as a set, and trims text like the contract", () => {
    const one = row("1", {
      categories: [
        { id: "c1", name: "Begroeten", published: true, slug: "begroeten" },
        { id: "c2", name: "Dieren", published: false, slug: "dieren" },
      ],
    });
    let edits = setEdit(new Map(), one, "categoryIds", ["c2", "c1"]);
    expect(edits.size).toBe(0);
    edits = setEdit(edits, one, "name", `  ${one.name} `);
    expect(edits.size).toBe(0);
  });

  test("lists old and new per field, with category names", () => {
    const one = row("1");
    let edits = setEdit(new Map(), one, "categoryIds", ["c1", "c2"]);
    edits = setEdit(edits, one, "playbackId", "pb-nieuw");
    expect(changesOf(edits, NAMES, JOIN)).toEqual([
      {
        fields: [
          { after: "pb-nieuw", before: "pb-1", field: "playbackId" },
          {
            after: "Begroeten, Dieren",
            before: "Begroeten",
            field: "categoryIds",
          },
        ],
        id: "1",
        name: "Gebaar 1",
      },
    ]);
  });

  test("marks invalid cells: an empty name, a bad playback id, no category", () => {
    const one = row("1");
    let edits = setEdit(new Map(), one, "name", "  ");
    edits = setEdit(edits, one, "playbackId", "geen id!");
    edits = setEdit(edits, one, "categoryIds", []);
    expect([...invalidFields(edits.get("1"))].sort()).toEqual([
      "categoryIds",
      "name",
      "playbackId",
    ]);
    expect(invalidFields(undefined).size).toBe(0);
  });

  test("a new playback id clears the old Mux asset id (I4)", () => {
    const one = row("1", { muxAssetId: "asset-old" });
    const edits = setEdit(new Map(), one, "playbackId", "pb-nieuw");
    expect(saveManyItems(edits)).toEqual([
      {
        expectedUpdatedAt: 100,
        id: "1",
        patch: { muxAssetId: null, playbackId: "pb-nieuw" },
      },
    ]);
  });

  test("a stale row is rebased on theirs: their fields stay, mine stay mine, both changed is a conflict", () => {
    const one = row("1");
    const two = row("2");
    let edits = setEdit(new Map(), one, "name", "Mijn naam");
    edits = setEdit(edits, one, "description", "Mijn uitleg");
    edits = setEdit(edits, two, "name", "Rij twee");
    // B changed row 1's description and keywords; row 2 is not stale.
    const theirs = row("1", {
      description: "Uitleg van B",
      keywords: ["hallo", "dag"],
      updatedAt: 200,
    });
    const { conflicts, edits: rebased } = rebaseEdits(
      edits,
      new Map([["1", theirs]]),
      ["1"]
    );
    expect(conflicts).toEqual(new Map([["1", ["description"]]]));
    expect(saveManyItems(rebased)).toEqual([
      {
        expectedUpdatedAt: 200,
        id: "1",
        patch: { description: "Mijn uitleg", name: "Mijn naam" },
      },
      { expectedUpdatedAt: 100, id: "2", patch: { name: "Rij twee" } },
    ]);
    // "Use their version": the conflicting fields leave the buffer.
    expect(saveManyItems(resolveConflicts(rebased, conflicts))).toEqual([
      { expectedUpdatedAt: 200, id: "1", patch: { name: "Mijn naam" } },
      { expectedUpdatedAt: 100, id: "2", patch: { name: "Rij twee" } },
    ]);
  });

  test("a stale row whose edits equal theirs leaves the buffer", () => {
    const edits = setEdit(new Map(), row("1"), "name", "Zelfde");
    const { conflicts, edits: rebased } = rebaseEdits(
      edits,
      new Map([["1", row("1", { name: "Zelfde", updatedAt: 200 })]]),
      ["1"]
    );
    expect(conflicts.size).toBe(0);
    expect(rebased.size).toBe(0);
  });
});
