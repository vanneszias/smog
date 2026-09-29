import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { classesOf, renderKit } from "../test/render";
import { Logo } from "./logo";

describe("Logo", () => {
  test("is an image named by the a11y label", () => {
    renderKit(<Logo tone="primary" />);
    const logo = screen.getByRole("img", { name: "SMOG & Co logo" });
    expect(classesOf(logo)).toContain("text-primary");
    expect(logo.querySelector("svg")).not.toBeNull();
  });

  test("decorative logos are hidden", () => {
    const { container } = renderKit(<Logo decorative variant="stacked" />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe(
      "true"
    );
  });
});
