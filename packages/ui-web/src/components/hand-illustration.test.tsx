import { describe, expect, test } from "bun:test";
import { handSvgs } from "@smog/brand/svg";
import { classesOf, renderKit } from "../test/render";
import { HandIllustration } from "./hand-illustration";

describe("HandIllustration", () => {
  test("is decorative, draws the chosen brand hand and takes classes", () => {
    const { container } = renderKit(
      <HandIllustration className="h-24 text-danger-strong" hand={2} />
    );
    const art = container.querySelector("[data-slot=hand-illustration]");
    expect(art?.getAttribute("aria-hidden")).toBe("true");
    expect(art?.getAttribute("data-hand")).toBe("2");
    expect(art?.querySelectorAll("path").length).toBeGreaterThan(0);
    expect(handSvgs[2]).toContain("<svg");
    expect(classesOf(art ?? null)).toContain("h-24");
    expect(classesOf(art ?? null)).not.toContain("h-16");
  });

  test("the first hand by default", () => {
    const { container } = renderKit(<HandIllustration />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(
      container
        .querySelector("[data-slot=hand-illustration]")
        ?.getAttribute("data-hand")
    ).toBe("0");
  });
});
