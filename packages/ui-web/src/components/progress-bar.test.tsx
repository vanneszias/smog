import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { classesOf, renderKit } from "../test/render";
import { ProgressBar } from "./progress-bar";

describe("ProgressBar", () => {
  test("is a labelled progressbar with its value", () => {
    renderKit(<ProgressBar label="Uploading video" value={40} />);
    const bar = screen.getByRole("progressbar", { name: "Uploading video" });
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    const fill = bar.firstElementChild;
    expect(classesOf(fill)).toContain("bg-primary");
    expect((fill as HTMLElement).style.transform).toBe("translateX(-60%)");
  });

  test("indeterminate without a value; tones", () => {
    renderKit(<ProgressBar label="Rendering" tone="success" />);
    const bar = screen.getByRole("progressbar", { name: "Rendering" });
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    const fill = bar.firstElementChild;
    expect(classesOf(fill)).toContain("bg-success");
    expect(classesOf(fill)).toContain("motion-reduce:animate-none");
  });
});
