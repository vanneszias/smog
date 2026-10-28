import { describe, expect, test } from "bun:test";
import { Spinner } from "../../../../../ui-web/src/components/spinner";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

describe("Spinner", () => {
  test("is decorative and stops under reduced motion", () => {
    const { container } = renderKit(<Spinner size="lg" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(classesOf(svg)).toContain("motion-reduce:animate-none");
    expect(classesOf(svg)).toContain("size-8");
  });
});
