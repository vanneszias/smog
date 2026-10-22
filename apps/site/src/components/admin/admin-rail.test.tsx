import { describe, expect, test } from "bun:test";
import { SidebarProvider } from "@smog/ui-web";
import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderSite } from "@/test/render";
import { AdminRail } from "./admin-rail";

function Page(): ReactNode {
  return (
    <SidebarProvider>
      <AdminRail />
      <main data-testid="page" />
    </SidebarProvider>
  );
}

describe("the admin rail in the first (server) markup", () => {
  test("is hidden below md, so a phone never shows the 16rem rail before hydration", async () => {
    await renderSite(Page, { path: "/admin" });
    const rail = document.querySelector('[data-slot="sidebar"]');
    expect(rail).not.toBeNull();
    const classes = (rail?.getAttribute("class") ?? "").split(/\s+/);
    // `hidden` is the base, `md:flex` the desktop display; no unprefixed `flex`.
    expect(classes).toContain("hidden");
    expect(classes).toContain("md:flex");
    expect(classes).not.toContain("flex");
    expect(screen.getByRole("navigation")).toBeDefined();
  });
});
