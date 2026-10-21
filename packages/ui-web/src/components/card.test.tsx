import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { classesOf, renderKit } from "../test/render";
import { Card, CardDescription, CardTitle } from "./card";

describe("Card", () => {
  test("is a surface with the registry radius; raised adds elevation 1", () => {
    renderKit(
      <Card data-testid="card" variant="raised">
        <CardTitle>Title</CardTitle>
        <CardDescription>Text</CardDescription>
      </Card>
    );
    const card = classesOf(screen.getByTestId("card"));
    expect(card).toContain("rounded-2xl");
    expect(card).toContain("shadow-1");
    expect(card).toContain("dark:bg-popover");
    expect(screen.getByRole("heading", { name: "Title" })).toBeDefined();
  });
});
