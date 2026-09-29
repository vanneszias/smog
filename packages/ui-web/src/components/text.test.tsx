import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { classesOf, renderKit } from "../test/render";
import { Heading, Text } from "./text";

describe("Text and Heading", () => {
  test("Text renders a paragraph with size and tone", () => {
    renderKit(
      <Text size="body-sm" tone="muted">
        Hint
      </Text>
    );
    const text = screen.getByText("Hint");
    expect(text.tagName).toBe("P");
    expect(classesOf(text)).toContain("text-body-sm");
    expect(classesOf(text)).toContain("text-foreground-muted");
  });

  test("Text as span", () => {
    renderKit(<Text as="span">x</Text>);
    expect(screen.getByText("x").tagName).toBe("SPAN");
  });

  test("Heading level sets the element, size the type step", () => {
    renderKit(
      <Heading level={1} size="display">
        Welcome
      </Heading>
    );
    const heading = screen.getByRole("heading", { level: 1, name: "Welcome" });
    expect(classesOf(heading)).toContain("text-display");
  });

  test("Heading size defaults from the level", () => {
    renderKit(<Heading level={3}>Card</Heading>);
    expect(classesOf(screen.getByRole("heading", { level: 3 }))).toContain(
      "text-title-3"
    );
  });
});
