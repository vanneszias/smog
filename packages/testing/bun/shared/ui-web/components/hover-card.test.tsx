import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../../../../../ui-web/src/components/hover-card";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

describe("HoverCard", () => {
  test("renders its content in a popover surface with reduced-motion safe animation", () => {
    renderKit(
      <HoverCard defaultOpen>
        <HoverCardTrigger asChild>
          <a href="/gestures/hello">Hello</a>
        </HoverCardTrigger>
        <HoverCardContent>A greeting</HoverCardContent>
      </HoverCard>
    );
    expect(screen.getByRole("link", { name: "Hello" })).toBeDefined();
    const content = screen
      .getAllByText("A greeting")
      .find(
        (element) => element.getAttribute("data-slot") === "hover-card-content"
      );
    expect(content).toBeDefined();
    expect(classesOf(content ?? null)).toContain("bg-popover");
    expect(classesOf(content ?? null)).toContain("motion-reduce:animate-none");
  });
});
