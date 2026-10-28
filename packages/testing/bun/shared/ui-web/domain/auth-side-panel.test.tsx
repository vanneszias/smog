import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { AuthSidePanel } from "../../../../../ui-web/src/domain/auth-side-panel";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

describe("AuthSidePanel", () => {
  test("a green surface with the tagline, a hand and no landmark", () => {
    const { container } = renderKit(<AuthSidePanel tagline="Learn gestures" />);
    const panel = container.querySelector("[data-slot=auth-side-panel]");
    expect(classesOf(panel ?? null)).toContain("bg-primary");
    // Hidden below md: the form is the page on a phone.
    expect(classesOf(panel ?? null)).toContain("hidden");
    expect(screen.getByText("Learn gestures")).toBeDefined();
    expect(
      container.querySelector("[data-slot=hand-illustration]")
    ).not.toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("region")).toBeNull();
  });
});
