import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classesOf, renderKit } from "../test/render";
import { IconButton } from "./icon-button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "./menu";

describe("Menu", () => {
  test("a menu of menuitems; danger items use the danger text role", async () => {
    const onSelect = mock();
    renderKit(
      <Menu defaultOpen>
        <MenuTrigger asChild>
          <IconButton icon={<svg />} label="More actions" />
        </MenuTrigger>
        <MenuContent>
          <MenuLabel>List</MenuLabel>
          <MenuItem onSelect={onSelect}>Rename</MenuItem>
          <MenuSeparator />
          <MenuItem variant="danger">Delete</MenuItem>
        </MenuContent>
      </Menu>
    );
    expect(screen.getByRole("menu")).toBeDefined();
    const rename = screen.getByRole("menuitem", { name: "Rename" });
    expect(classesOf(rename)).toContain("min-h-touch");
    expect(
      classesOf(screen.getByRole("menuitem", { name: "Delete" }))
    ).toContain("text-danger-strong");
    await userEvent.click(rename);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
