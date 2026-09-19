import { describe, expect, it } from "vitest";
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

  it("defaults isActive to true so new categories are visible", () => {
    const isActive = Categories.fields.find(
      (field) => "name" in field && field.name === "isActive"
    );
    expect(isActive).toHaveProperty("defaultValue", true);
  });

  it("uses name as the admin title", () => {
    expect(Categories.admin?.useAsTitle).toBe("name");
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
