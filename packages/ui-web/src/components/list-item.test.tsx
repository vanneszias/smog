import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classesOf, renderKit } from "../test/render";
import { ListItem } from "./list-item";

const FAVORITES = /Favorites/;

describe("ListItem", () => {
  test("with onClick it is a button named by its title", async () => {
    const onClick = mock();
    renderKit(
      <ListItem description="Two lists" onClick={onClick} title="Favorites" />
    );
    const item = screen.getByRole("button", { name: FAVORITES });
    expect(classesOf(item)).toContain("min-h-touch");
    await userEvent.click(item);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("without onClick it is static", () => {
    renderKit(<ListItem title="Static" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Static")).toBeDefined();
  });
});
