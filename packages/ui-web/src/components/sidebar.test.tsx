import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderKit } from "../test/render";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "./sidebar";

function Shell(): React.ReactNode {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive>
                  <a href="/admin">Dashboard</a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <SidebarTrigger />
      </SidebarInset>
    </SidebarProvider>
  );
}

describe("Sidebar", () => {
  test("the current item is marked and the trigger collapses the panel", async () => {
    const { container } = renderKit(<Shell />);
    const link = screen.getByRole("link", { name: "Dashboard" });
    expect(link.getAttribute("aria-current")).toBe("page");
    const panel = container.querySelector('[data-slot="sidebar"]');
    expect(panel?.getAttribute("data-state")).toBe("expanded");
    await userEvent.click(
      screen.getByRole("button", { name: "Toggle sidebar" })
    );
    expect(panel?.getAttribute("data-state")).toBe("collapsed");
  });

  test("Ctrl+B toggles it", async () => {
    const { container } = renderKit(<Shell />);
    await userEvent.keyboard("{Control>}b{/Control}");
    expect(
      container
        .querySelector('[data-slot="sidebar"]')
        ?.getAttribute("data-state")
    ).toBe("collapsed");
  });

  test("Ctrl+B in a text field is left to the field (bold, the browser)", async () => {
    const { container } = renderKit(
      <>
        <Shell />
        <textarea aria-label="Notes" />
      </>
    );
    await userEvent.click(screen.getByRole("textbox", { name: "Notes" }));
    const notes = screen.getByRole("textbox", { name: "Notes" });
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "b",
    });
    notes.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(
      container
        .querySelector('[data-slot="sidebar"]')
        ?.getAttribute("data-state")
    ).toBe("expanded");
  });

  test("a menu button outside the provider fails loudly", () => {
    expect(() =>
      renderKit(<SidebarMenuButton>Orphan</SidebarMenuButton>)
    ).toThrow();
  });
});
