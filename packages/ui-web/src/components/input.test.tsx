import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { classesOf, renderKit } from "../test/render";
import { Input } from "./input";

describe("Input", () => {
  test("is a 44 px textbox with the functional border and focus ring", () => {
    renderKit(<Input aria-label="Name" />);
    const input = screen.getByRole("textbox", { name: "Name" });
    const classes = classesOf(input);
    expect(classes).toContain("min-h-touch");
    expect(classes).toContain("border-foreground-muted");
    expect(classes).toContain("focus-visible:ring-focus-ring");
  });

  test("lg size, invalid state and typing", async () => {
    renderKit(<Input aria-label="Name" invalid size="lg" />);
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(classesOf(input)).toContain("min-h-12");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    await userEvent.type(input, "Sam");
    expect((input as HTMLInputElement).value).toBe("Sam");
  });

  test("a leading icon pads the input and is decorative", () => {
    renderKit(<Input aria-label="Email" leading={<svg data-testid="i" />} />);
    expect(classesOf(screen.getByRole("textbox"))).toContain("pl-10");
    expect(
      screen.getByTestId("i").parentElement?.getAttribute("aria-hidden")
    ).toBe("true");
  });

  test("forwards the ref", () => {
    const ref = createRef<HTMLInputElement>();
    renderKit(<Input aria-label="x" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
