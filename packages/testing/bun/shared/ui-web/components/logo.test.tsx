import { describe, expect, test } from "bun:test";
import { logoSmallSvg } from "@smog/brand/svg";
import { screen } from "@testing-library/react";
import { Logo } from "../../../../../ui-web/src/components/logo";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

describe("Logo", () => {
  test("is an image named by the brand alone", () => {
    renderKit(<Logo tone="primary" />);
    const logo = screen.getByRole("img", { name: "SMOG & Co" });
    expect(classesOf(logo)).toContain("text-primary");
    expect(logo.querySelector("svg")).not.toBeNull();
  });

  test("decorative logos are hidden", () => {
    const { container } = renderKit(<Logo decorative variant="stacked" />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe(
      "true"
    );
  });

  test("the small variant draws the small-size artwork", () => {
    const paths = (svg: string): number => svg.split("<path").length - 1;
    const small = renderKit(<Logo decorative size="sm" variant="small" />);
    const full = renderKit(<Logo decorative size="sm" />);
    const smallSvg = small.container.firstElementChild?.innerHTML ?? "";
    expect(paths(smallSvg)).toBe(paths(logoSmallSvg));
    expect(smallSvg).not.toBe(full.container.firstElementChild?.innerHTML);
  });
});
