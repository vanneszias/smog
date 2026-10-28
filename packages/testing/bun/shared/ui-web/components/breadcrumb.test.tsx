import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../../../../../ui-web/src/components/breadcrumb";
import { renderKit } from "../../../../support/ui-web/render";

describe("Breadcrumb", () => {
  test("a labelled nav; the current page is marked, the separators are hidden", () => {
    renderKit(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin">Admin</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Gestures</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" })
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "Admin" })).toBeDefined();
    expect(screen.getByText("Gestures").getAttribute("aria-current")).toBe(
      "page"
    );
    expect(screen.getByText("More").className).toContain("sr-only");
  });

  test("copy follows the locale", () => {
    renderKit(<Breadcrumb />, "nl");
    expect(
      screen.getByRole("navigation", { name: "Broodkruimelpad" })
    ).toBeDefined();
  });
});
