import { describe, expect, it } from "vitest";
import { isAdmin, publicReadActive } from "@/access";
import { blockDeleteWhenSponsored } from "@/hooks/blockDeleteWhenSponsored";
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

  it("guards deletes against existing sponsorships", () => {
    // The behaviour lives in `Gestures.delete.int.test.ts`, which deletes a
    // real sponsored gesture. This only pins that the hook is still wired
    // up, which is the one way the behaviour disappears silently.
    // `toContain` against a possibly-undefined value silently passes in
    // Vitest 5 — verified by deleting the hooks block and watching this test
    // stay green — so this asserts the array itself.
    expect(Gestures.hooks?.beforeDelete).toEqual([blockDeleteWhenSponsored]);
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
});
