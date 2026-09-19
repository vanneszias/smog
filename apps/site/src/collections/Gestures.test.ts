import { describe, expect, it } from "vitest";
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

  it("indexes isActive, because every public query filters on it", () => {
    expect(field("isActive")).toHaveProperty("index", true);
  });

  it("does not require the name field at the field level, since that would validate per-locale", () => {
    expect(field("name")).not.toHaveProperty("required", true);
  });
});
