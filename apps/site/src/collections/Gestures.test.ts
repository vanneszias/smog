import { describe, expect, it } from "vitest";
import { isAdmin, publicReadActive } from "@/access";
import { blockDeleteWhenSponsored } from "@/hooks/blockDeleteWhenSponsored";
import { dropDeletedGestureFromLists } from "@/hooks/dropDeletedGestureFromLists";
import { Gestures } from "./Gestures";

const field = (name: string) =>
  Gestures.fields.find((f) => "name" in f && f.name === name);

describe("Gestures collection", () => {
  it("uses the gestures slug", () => {
    expect(Gestures.slug).toBe("gestures");
  });

  it("localizes name, info and concepts", () => {
    for (const name of ["name", "info", "concepts"]) {
      expect(field(name)).toHaveProperty("localized", true);
    }
  });

  it("relates to many categories", () => {
    expect(field("categories")).toMatchObject({
      type: "relationship",
      relationTo: "categories",
      hasMany: true,
    });
  });

  it("requires a Mux playback id", () => {
    expect(field("playbackId")).toMatchObject({
      type: "text",
      required: true,
    });
  });

  it("guards deletes against existing sponsorships, then strips the gesture from lists", () => {
    // The behaviours live in `Gestures.delete.int.test.ts` and
    // `Lists.delete.int.test.ts`, which delete real gestures against a real
    // database. This only pins that both hooks are still wired up, which is
    // the one way either behaviour disappears silently.
    //
    // Asserts the whole array rather than membership, so that appending a
    // third hook is also a deliberate change rather than something that
    // slips in unnoticed. (An earlier comment here claimed `toContain`
    // against an undefined value silently passes in Vitest 5. It does not —
    // it raises "the given combination of arguments (undefined and ...) is
    // invalid for this assertion". `toEqual` is still the stronger check,
    // but not for that reason.)
    //
    // The order is part of the assertion, not incidental to it: the
    // sponsorship guard refuses the delete, the list hook rewrites rows, and
    // running them the other way round would have a refused delete depend on
    // the transaction rolling back work it should never have started.
    expect(Gestures.hooks?.beforeDelete).toEqual([
      blockDeleteWhenSponsored,
      dropDeletedGestureFromLists,
    ]);
  });

  it("indexes isActive, because every public query filters on it", () => {
    expect(field("isActive")).toHaveProperty("index", true);
  });

  it("does not require the name field at the field level, since that would validate per-locale", () => {
    expect(field("name")).not.toHaveProperty("required", true);
  });

  it("enforces the Dutch-required policy on name through a validate function", () => {
    const name = field("name");
    expect(name).toHaveProperty("validate");
    expect(typeof (name as { validate?: unknown } | undefined)?.validate).toBe(
      "function"
    );
  });

  it("wires public reads through publicReadActive, not a raw boolean", () => {
    // Reference equality, not just "is a function": swapping this for
    // isAdmin, isAuthenticated, or an inline `() => true` would still pass
    // a type check but would leak inactive gestures (or lock reads to
    // admins). The behavior itself is covered end-to-end in
    // access/publicReadActive.int.test.ts.
    expect(Gestures.access?.read).toBe(publicReadActive);
  });

  it("wires create, update and delete to isAdmin", () => {
    expect(Gestures.access?.create).toBe(isAdmin);
    expect(Gestures.access?.update).toBe(isAdmin);
    expect(Gestures.access?.delete).toBe(isAdmin);
  });

  it("carries the Convex _id as a hidden, read-only, unique legacyId", () => {
    // The importer (Stage 9 Task 3) looks documents up by this field to
    // decide whether it already created them, so its name and shape are a
    // contract with code that does not exist in this repo yet. Unique so a
    // rerun cannot create a second gesture for one Convex row; indexed
    // because every lookup during import is an equality match on it; hidden
    // and read-only because it is bookkeeping for the importer, not something
    // an editor should see or change; not localized and not required because
    // it exists only on rows the importer created — every gesture made in
    // the admin after cutover has none.
    const legacyId = field("legacyId");
    expect(legacyId).toMatchObject({
      name: "legacyId",
      type: "text",
      unique: true,
      index: true,
      admin: { readOnly: true, hidden: true },
    });
    expect(legacyId).not.toHaveProperty("localized", true);
    expect(legacyId).not.toHaveProperty("required", true);
  });
});
