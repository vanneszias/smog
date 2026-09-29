import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { classesOf, renderKit } from "../test/render";
import { Badge } from "./badge";

describe("Badge", () => {
  test("variants use strong text on the subtle tint", () => {
    renderKit(
      <>
        <Badge>Neutral</Badge>
        <Badge variant="success">Paid</Badge>
        <Badge variant="accent">New</Badge>
      </>
    );
    expect(classesOf(screen.getByText("Neutral"))).toContain(
      "bg-surface-sunken"
    );
    const success = classesOf(screen.getByText("Paid"));
    expect(success).toContain("bg-success-subtle");
    expect(success).toContain("text-success-strong");
    const accent = classesOf(screen.getByText("New"));
    expect(accent).toContain("bg-accent");
    expect(accent).toContain("text-accent-foreground");
  });
});
