import { describe, expect, it } from "vitest";
import { Categories } from "./Categories";

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
