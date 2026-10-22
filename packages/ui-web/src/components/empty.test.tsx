import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { renderKit } from "../test/render";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty";

describe("Empty parts", () => {
  test("every part carries its registry data-slot and the title its level", () => {
    const { container } = renderKit(
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">i</EmptyMedia>
          <EmptyTitle level={2}>Nothing</EmptyTitle>
          <EmptyDescription>Add one</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>action</EmptyContent>
      </Empty>
    );
    for (const slot of [
      "empty",
      "empty-header",
      "empty-icon",
      "empty-title",
      "empty-description",
      "empty-content",
    ]) {
      expect(container.querySelector(`[data-slot=${slot}]`)).not.toBeNull();
    }
    expect(
      screen.getByRole("heading", { level: 2, name: "Nothing" })
    ).toBeDefined();
    expect(
      container
        .querySelector("[data-slot=empty-icon]")
        ?.getAttribute("data-variant")
    ).toBe("icon");
  });
});
