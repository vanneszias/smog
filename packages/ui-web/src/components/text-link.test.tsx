import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { classesOf, renderKit } from "../test/render";
import { TextLink } from "./text-link";

/** Stands in for a router `Link` (it renders an `<a>` itself). */
function RouterLink(props: ComponentProps<"a">) {
  return <a data-router="" {...props} />;
}

describe("TextLink", () => {
  test("is a link with the focus ring, hover and a 44 px hit area", () => {
    renderKit(<TextLink href="/terms">Voorwaarden</TextLink>);
    const link = screen.getByRole("link", { name: "Voorwaarden" });
    expect(link.getAttribute("href")).toBe("/terms");
    const classes = classesOf(link);
    expect(classes).toContain("focus-visible:ring-focus-ring");
    expect(classes).toContain("focus-visible:ring-offset-2");
    expect(classes).toContain("hover:underline");
    expect(classes).toContain("after:size-touch");
    expect(classes).toContain("text-primary-strong");
  });

  test("asChild styles a router link and keeps its props", () => {
    renderKit(
      <TextLink asChild tone="muted">
        <RouterLink href="/sign-up">Maak er een aan</RouterLink>
      </TextLink>
    );
    const link = screen.getByRole("link", { name: "Maak er een aan" });
    expect(link.hasAttribute("data-router")).toBe(true);
    expect(classesOf(link)).toContain("text-foreground-muted");
  });
});
