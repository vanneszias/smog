import { describe, expect, it } from "@jest/globals";
import { pickText } from "../../../../../../apps/mobile/src/lessons/lesson-text";

describe("pickText", () => {
  it("prefers the app's language, then the default's, then any", () => {
    const texts = { en: "Animals", fr: "Animaux", nl: "Dieren" };
    expect(pickText(texts, "fr", "nl")).toBe("Animaux");
    expect(pickText({ nl: "Dieren" }, "fr", "nl")).toBe("Dieren");
    expect(pickText({ en: "Animals" }, "fr", "nl")).toBe("Animals");
  });

  it("counts empty and blank text as missing", () => {
    expect(pickText({ fr: "  ", nl: "Dieren" }, "fr", "nl")).toBe("Dieren");
    expect(pickText({ fr: "", nl: "" }, "fr", "nl")).toBeUndefined();
    expect(pickText({}, "fr", "nl")).toBeUndefined();
  });
});
