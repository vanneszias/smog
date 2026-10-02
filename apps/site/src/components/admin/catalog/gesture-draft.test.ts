import { describe, expect, test } from "bun:test";
import {
  type GestureDraft,
  mergeDrafts,
  patchOf,
  withMine,
} from "./gesture-draft";

/*
 * The editor's three-way merge after a stale save (C1): `base` is the
 * version the form was opened on, `mine` the form, `theirs` the newer
 * version. Theirs wins where only they changed a field, mine where only I
 * did; both changing one field differently is a conflict for the admin.
 */

const BASE: GestureDraft = {
  categoryIds: ["c1"],
  description: "Origineel",
  keywords: ["hallo"],
  name: "Zwaaien",
  published: true,
  video: { playbackId: "pb-1" },
};

describe("mergeDrafts", () => {
  test("keeps their description and keywords when I only renamed (the review's probe)", () => {
    const mine = { ...BASE, name: "Mijn naam" };
    const theirs = {
      ...BASE,
      description: "Van B",
      keywords: ["hallo", "dag"],
    };
    const { conflicts, merged } = mergeDrafts(BASE, mine, theirs);
    expect(conflicts).toEqual([]);
    expect(merged).toEqual({
      ...theirs,
      name: "Mijn naam",
    });
    // Saved against theirs, only my field goes out.
    expect(patchOf(theirs, merged)).toEqual({ name: "Mijn naam" });
  });

  test("never republishes what they unpublished", () => {
    const mine = { ...BASE, name: "Mijn naam" };
    const theirs = { ...BASE, published: false };
    const { conflicts, merged } = mergeDrafts(BASE, mine, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.published).toBe(false);
  });

  test("the same change on both sides is no conflict", () => {
    const mine = { ...BASE, categoryIds: ["c2", "c1"] };
    const theirs = { ...BASE, categoryIds: ["c1", "c2"] };
    expect(mergeDrafts(BASE, mine, theirs).conflicts).toEqual([]);
  });

  test("both changing a field differently is a conflict; their version is the default", () => {
    const mine = { ...BASE, description: "Van A", name: "A" };
    const theirs = { ...BASE, name: "B", video: { playbackId: "pb-2" } };
    const { conflicts, merged } = mergeDrafts(BASE, mine, theirs);
    expect(conflicts).toEqual(["name"]);
    expect(merged).toEqual({
      ...theirs,
      description: "Van A",
      name: "B",
    });
    expect(withMine(merged, mine, conflicts)).toEqual({
      ...theirs,
      description: "Van A",
      name: "A",
    });
  });
});
