import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { Avatar } from "../../../../../ui-web/src/components/avatar";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

describe("Avatar", () => {
  test("falls back to initials and is named by the name", () => {
    renderKit(<Avatar name="Sam de Smet" size="lg" />);
    const avatar = screen.getByRole("img", { name: "Sam de Smet" });
    // Generated content (`before:content-[attr(data-initials)]`), not text.
    expect(
      avatar.querySelector("[data-initials]")?.getAttribute("data-initials")
    ).toBe("SS");
    expect(avatar.textContent).toBe("");
    expect(classesOf(avatar)).toContain("size-12");
  });
});
