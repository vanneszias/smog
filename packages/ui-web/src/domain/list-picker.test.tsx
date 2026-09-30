import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../components/button";
import { renderKit } from "../test/render";
import { ListPicker } from "./list-picker";

const noop = (): void => undefined;

const LISTS = [
  { contains: true, id: "l1", name: "At school" },
  { contains: false, id: "l2", name: "At home" },
];

describe("ListPicker", () => {
  test("the trigger opens a sheet of checkboxes, one per list", async () => {
    const onToggle = mock();
    renderKit(
      <ListPicker lists={LISTS} onCreate={noop} onToggle={onToggle}>
        <Button>Save</Button>
      </ListPicker>
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("dialog", { name: "Save to list" })).toBeDefined();
    const school = screen.getByRole("checkbox", { name: "At school" });
    const home = screen.getByRole("checkbox", { name: "At home" });
    expect(school.getAttribute("aria-checked")).toBe("true");
    expect(home.getAttribute("aria-checked")).toBe("false");
    await userEvent.click(home);
    expect(onToggle).toHaveBeenCalledWith("l2");
  });

  test("a pending list's checkbox is disabled (its state is not known yet)", () => {
    renderKit(
      <ListPicker
        lists={[
          { contains: false, id: "l1", name: "At school", pending: true },
        ]}
        onCreate={noop}
        onToggle={noop}
        open
      />
    );
    const school = screen.getByRole("checkbox", { name: "At school" });
    expect(school.hasAttribute("disabled")).toBe(true);
  });

  test("creates a list from the trimmed name and clears the field", async () => {
    const onCreate = mock();
    renderKit(
      <ListPicker lists={[]} onCreate={onCreate} onToggle={noop} open />
    );
    expect(screen.getByText("You don't have any lists yet.")).toBeDefined();
    const create = screen.getByRole("button", { name: "Create" });
    expect(create.hasAttribute("disabled")).toBe(true);
    const input = screen.getByRole("textbox", { name: "New list" });
    await userEvent.type(input, "  Class 3  ");
    expect(create.hasAttribute("disabled")).toBe(false);
    await userEvent.click(create);
    expect(onCreate).toHaveBeenCalledWith("Class 3");
    expect((input as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input);
    await userEvent.type(input, "Songs{Enter}");
    expect(onCreate).toHaveBeenLastCalledWith("Songs");
  });

  test("nameMaxLength limits the field", () => {
    renderKit(
      <ListPicker
        lists={LISTS}
        nameMaxLength={80}
        onCreate={noop}
        onToggle={noop}
        open
      />
    );
    expect(
      screen
        .getByRole("textbox", { name: "New list" })
        .getAttribute("maxlength")
    ).toBe("80");
  });
});
