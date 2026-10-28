import { describe, expect, test } from "bun:test";
import { AspectRatio } from "../../../../../ui-web/src/components/aspect-ratio";
import { renderKit } from "../../../../support/ui-web/render";

describe("AspectRatio", () => {
  test("keeps its content in a box with the ratio", () => {
    const { container } = renderKit(
      <AspectRatio ratio={3 / 4}>
        <img alt="" height={4} src="data:," width={3} />
      </AspectRatio>
    );
    const box = container.querySelector('[data-slot="aspect-ratio"]');
    expect(box).not.toBeNull();
    expect(box?.parentElement?.getAttribute("style")).toContain(
      "padding-bottom: 133.333"
    );
  });
});
