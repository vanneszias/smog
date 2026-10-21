import { describe, expect, test } from "bun:test";
import { renderKit } from "../test/render";
import { AspectRatio } from "./aspect-ratio";

describe("AspectRatio", () => {
  test("keeps its content in a box with the ratio", () => {
    const { container } = renderKit(
      <AspectRatio ratio={3 / 4}>
        <img alt="" src="data:," />
      </AspectRatio>
    );
    const box = container.querySelector('[data-slot="aspect-ratio"]');
    expect(box).not.toBeNull();
    expect(box?.parentElement?.getAttribute("style")).toContain(
      "padding-bottom: 133.333"
    );
  });
});
