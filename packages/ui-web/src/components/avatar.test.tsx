import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { classesOf, renderKit } from "../test/render";
import { Avatar } from "./avatar";

describe("Avatar", () => {
  test("falls back to initials and is named by the name", () => {
    renderKit(<Avatar name="Sam de Smet" size="lg" />);
    const avatar = screen.getByRole("img", { name: "Sam de Smet" });
    expect(avatar.textContent).toBe("SS");
    expect(classesOf(avatar)).toContain("size-12");
  });
});
