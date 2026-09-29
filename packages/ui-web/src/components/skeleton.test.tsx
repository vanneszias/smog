import { describe, expect, test } from "bun:test";
import { classesOf, renderKit } from "../test/render";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  test("is hidden from assistive tech and stops pulsing under reduced motion", () => {
    const { container } = renderKit(<Skeleton shape="circle" />);
    const el = container.firstElementChild;
    expect(el?.getAttribute("aria-hidden")).toBe("true");
    expect(classesOf(el)).toContain("motion-reduce:animate-none");
    expect(classesOf(el)).toContain("rounded-full");
  });
});
