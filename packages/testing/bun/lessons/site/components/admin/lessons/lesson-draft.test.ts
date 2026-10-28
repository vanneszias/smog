import { describe, expect, test } from "bun:test";
import { LESSON_MAX_GESTURES, type LessonItem } from "@smog/lessons/schema";
import {
  addItems,
  addSection,
  allItems,
  canAddSection,
  hasRoom,
  type LessonDraft,
  moveItem,
  parseLessonNumber,
  problemOf,
  removeItem,
  removeSection,
  renameSection,
  reorderItems,
  reorderSections,
  sameDraft,
  sectionOf,
  setText,
  toInput,
} from "../../../../../../../../apps/site/src/components/admin/lessons/lesson-draft";

function item(id: string): LessonItem {
  return {
    hasDrawing: false,
    id,
    name: id.toUpperCase(),
    playbackId: "pb",
    published: true,
    slug: id,
  };
}

const EMPTY: LessonDraft = {
  number: null,
  sections: [],
  translations: { nl: { notes: "", title: "Les 1" } },
  ungrouped: [],
};

function ids(items: readonly LessonItem[]): string[] {
  return items.map((entry) => entry.id);
}

describe("lesson draft operations", () => {
  test("a gesture is added once, to the ungrouped part or to a section", () => {
    let draft = addSection(EMPTY, "s1", { nl: "Deel" });
    draft = addItems(draft, [item("a"), item("b")], null);
    draft = addItems(draft, [item("a"), item("c")], "s1");
    expect(ids(draft.ungrouped)).toEqual(["a", "b"]);
    expect(ids(draft.sections[0]?.items ?? [])).toEqual(["c"]);
    expect(addItems(draft, [item("b")], "s1")).toBe(draft);
  });

  test("nothing is added past the lesson's cap", () => {
    const many = Array.from({ length: LESSON_MAX_GESTURES }, (_, i) =>
      item(`g${i}`)
    );
    const full = addItems(EMPTY, many, null);
    expect(hasRoom(full)).toBe(false);
    expect(addItems(full, [item("extra")], null)).toBe(full);
    const room = addItems(EMPTY, [...many, item("over")], null);
    expect(allItems(room)).toHaveLength(LESSON_MAX_GESTURES);
  });

  test("a section is added up to the cap", () => {
    let draft = EMPTY;
    for (let i = 0; i < 60; i += 1) {
      draft = addSection(draft, `s${i}`, {});
    }
    expect(draft.sections).toHaveLength(50);
    expect(canAddSection(draft)).toBe(false);
  });

  test("reorder keeps what the order does not name, at the end", () => {
    const draft = addItems(EMPTY, [item("a"), item("b"), item("c")], null);
    expect(ids(reorderItems(draft, null, ["c", "a"]).ungrouped)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(
      ids(reorderItems(draft, null, ["c", "zz", "b", "a"]).ungrouped)
    ).toEqual(["c", "b", "a"]);
  });

  test("a gesture moves to the end of another section and is found there", () => {
    let draft = addSection(addSection(EMPTY, "s1", {}), "s2", {});
    draft = addItems(draft, [item("a")], "s1");
    draft = addItems(draft, [item("b")], "s2");
    const moved = moveItem(draft, "a", "s2");
    expect(ids(moved.sections[0]?.items ?? [])).toEqual([]);
    expect(ids(moved.sections[1]?.items ?? [])).toEqual(["b", "a"]);
    expect(sectionOf(moved, "a")).toBe("s2");
    expect(sectionOf(moveItem(moved, "a", null), "a")).toBeNull();
    expect(sectionOf(moved, "nope")).toBeUndefined();
    expect(moveItem(draft, "nope", "s2")).toBe(draft);
  });

  test("removing a gesture, and removing a section, keep every other gesture", () => {
    let draft = addSection(addSection(EMPTY, "s1", {}), "s2", {});
    draft = addItems(draft, [item("u")], null);
    draft = addItems(draft, [item("a")], "s1");
    draft = addItems(draft, [item("b")], "s2");
    expect(ids(allItems(removeItem(draft, "a")))).toEqual(["u", "b"]);
    // Section 2's gestures move to the end of the section before it.
    const merged = removeSection(draft, "s2");
    expect(merged.sections.map((section) => section.id)).toEqual(["s1"]);
    expect(ids(merged.sections[0]?.items ?? [])).toEqual(["a", "b"]);
    // The first section's go to the ungrouped part.
    const first = removeSection(draft, "s1");
    expect(ids(first.ungrouped)).toEqual(["u", "a"]);
    expect(removeSection(draft, "nope")).toBe(draft);
  });

  test("sections reorder and rename per language; an empty title removes the language", () => {
    let draft = addSection(addSection(EMPTY, "s1", {}), "s2", {});
    draft = reorderSections(draft, ["s2", "s1"]);
    expect(draft.sections.map((section) => section.id)).toEqual(["s2", "s1"]);
    draft = renameSection(draft, "s1", "fr", "Salutations");
    draft = renameSection(draft, "s1", "nl", "Begroetingen");
    expect(draft.sections[1]?.titles).toEqual({
      fr: "Salutations",
      nl: "Begroetingen",
    });
    draft = renameSection(draft, "s1", "fr", "");
    expect(draft.sections[1]?.titles).toEqual({ nl: "Begroetingen" });
  });

  test("a save needs a title in some language, and a title for every language with notes", () => {
    expect(problemOf(EMPTY)).toBeNull();
    expect(problemOf(setText(EMPTY, "nl", "title", "  "))).toBe("noTitle");
    expect(problemOf(setText(EMPTY, "fr", "notes", "des notes"))).toBe(
      "notesWithoutTitle"
    );
    expect(
      problemOf(setText(setText(EMPTY, "fr", "notes", "n"), "fr", "title", "T"))
    ).toBeNull();
  });

  test("a typed lesson number is empty, 0 to 9999, or not a number yet", () => {
    expect(parseLessonNumber("")).toEqual({ number: null, valid: true });
    expect(parseLessonNumber("  ")).toEqual({ number: null, valid: true });
    expect(parseLessonNumber("0")).toEqual({ number: 0, valid: true });
    expect(parseLessonNumber(" 12 ")).toEqual({ number: 12, valid: true });
    expect(parseLessonNumber("9999")).toEqual({ number: 9999, valid: true });
    for (const typed of ["10000", "-1", "1e", "12.", "1.5", "abc", "٣"]) {
      expect(parseLessonNumber(typed), typed).toEqual({
        number: null,
        valid: false,
      });
    }
  });

  test("toInput sends the whole lesson with the version it was read at", () => {
    let draft = addSection(EMPTY, "s1", { nl: "Deel" });
    draft = addItems(draft, [item("u")], null);
    draft = addItems(draft, [item("a")], "s1");
    expect(toInput("lesson-1", 4, draft)).toEqual({
      expectedVersion: 4,
      id: "lesson-1",
      number: null,
      sections: [{ gestureIds: ["a"], id: "s1", titles: { nl: "Deel" } }],
      translations: { nl: { notes: "", title: "Les 1" } },
      ungrouped: ["u"],
    });
  });

  test("two drafts are the same lesson when only empty rows differ", () => {
    expect(sameDraft(EMPTY, { ...EMPTY })).toBe(true);
    expect(
      sameDraft(EMPTY, {
        ...EMPTY,
        translations: {
          en: { notes: "", title: "" },
          nl: { notes: "", title: "Les 1" },
        },
      })
    ).toBe(true);
    expect(sameDraft(EMPTY, setText(EMPTY, "nl", "notes", "x"))).toBe(false);
    const withItem = addItems(EMPTY, [item("a")], null);
    expect(sameDraft(EMPTY, withItem)).toBe(false);
  });
});
