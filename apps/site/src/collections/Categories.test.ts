import { describe, expect, it } from "vitest";
import { isAdmin, publicReadActive } from "@/access";
import { Categories, validateName } from "./Categories";

describe("Categories collection", () => {
  it("uses the categories slug", () => {
    expect(Categories.slug).toBe("categories");
  });

  it("localizes the name field", () => {
    const name = Categories.fields.find(
      (field) => "name" in field && field.name === "name"
    );
    expect(name).toBeDefined();
    expect(name).toHaveProperty("localized", true);
  });

  it("does not require a value at the field level, since that would validate per-locale and block saving in en/fr", () => {
    const name = Categories.fields.find(
      (field) => "name" in field && field.name === "name"
    );
    expect(name).not.toHaveProperty("required", true);
  });

  it("wires the Dutch-required policy onto the name field via validate", () => {
    const name = Categories.fields.find(
      (field) => "name" in field && field.name === "name"
    );
    expect((name as { validate?: unknown } | undefined)?.validate).toBe(
      validateName
    );
  });

  it("defaults isActive to true so new categories are visible", () => {
    const isActive = Categories.fields.find(
      (field) => "name" in field && field.name === "isActive"
    );
    expect(isActive).toHaveProperty("defaultValue", true);
  });

  it("uses name as the admin title", () => {
    expect(Categories.admin?.useAsTitle).toBe("name");
  });

  it("wires public reads through publicReadActive, not a raw boolean", () => {
    expect(Categories.access?.read).toBe(publicReadActive);
  });

  it("wires create, update and delete to isAdmin", () => {
    expect(Categories.access?.create).toBe(isAdmin);
    expect(Categories.access?.update).toBe(isAdmin);
    expect(Categories.access?.delete).toBe(isAdmin);
  });

  it("carries the Convex _id as a hidden, read-only, unique legacyId", () => {
    // The importer (`scripts/migrate-convex`) looks documents up by this field
    // to decide whether it already created them, so its name and shape are a
    // contract with that code. Unique so a rerun cannot create a second
    // category for one Convex row; indexed because every lookup during import
    // is an equality match on it; hidden and read-only because it is
    // bookkeeping for the importer, not something an editor should see or
    // change; not localized and not required because it exists only on rows the
    // importer created — every category made in the admin after cutover has
    // none.
    const legacyId = Categories.fields.find(
      (field) => "name" in field && field.name === "legacyId"
    );
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

describe("Categories name field validation", () => {
  it("requires a non-empty Dutch name, the source of truth locale", () => {
    const result = validateName("", { req: { locale: "nl" } } as Parameters<
      typeof validateName
    >[1]);
    expect(result).toBe("A Dutch name is required.");
  });

  it("accepts a non-empty Dutch name", () => {
    const result = validateName("Groeten", {
      req: { locale: "nl" },
    } as Parameters<typeof validateName>[1]);
    expect(result).toBe(true);
  });

  it("allows an empty name in a non-default locale like fr, since translations are optional", () => {
    const result = validateName("", { req: { locale: "fr" } } as Parameters<
      typeof validateName
    >[1]);
    expect(result).toBe(true);
  });

  it("allows an empty name in a non-default locale like en", () => {
    const result = validateName("", { req: { locale: "en" } } as Parameters<
      typeof validateName
    >[1]);
    expect(result).toBe(true);
  });
});
