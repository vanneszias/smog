import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { classesOf, renderKit } from "../test/render";
import { Separator } from "./separator";

describe("Separator", () => {
  test("decorative by default; a semantic one is a separator role", () => {
    renderKit(
      <>
        <Separator data-testid="plain" />
        <Separator decorative={false} orientation="vertical" />
      </>
    );
    expect(screen.getByTestId("plain").getAttribute("role")).toBe("none");
    const semantic = screen.getByRole("separator");
    expect(semantic.getAttribute("aria-orientation")).toBe("vertical");
    expect(classesOf(semantic)).toContain("bg-border");
  });
});
