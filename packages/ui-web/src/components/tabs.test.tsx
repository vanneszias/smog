import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classesOf, renderKit } from "../test/render";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

describe("Tabs", () => {
  test("tablist, tabs and panels are wired; the active tab is marked", async () => {
    renderKit(
      <Tabs defaultValue="profile">
        <TabsList aria-label="Account">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">Profile panel</TabsContent>
        <TabsContent value="privacy">Privacy panel</TabsContent>
      </Tabs>
    );
    expect(screen.getByRole("tablist", { name: "Account" })).toBeDefined();
    const profile = screen.getByRole("tab", { name: "Profile" });
    expect(profile.getAttribute("aria-selected")).toBe("true");
    expect(classesOf(profile)).toContain("min-h-touch");
    expect(classesOf(profile)).toContain("focus-visible:ring-focus-ring");
    expect(screen.getByRole("tabpanel").textContent).toBe("Profile panel");
    // Radix activates tabs on mousedown.
    await userEvent.pointer({
      keys: "[MouseLeft]",
      target: screen.getByRole("tab", { name: "Privacy" }),
    });
    expect(screen.getByRole("tabpanel").textContent).toBe("Privacy panel");
  });
});
