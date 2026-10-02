import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classesOf, renderKit } from "../test/render";
import { AlertDialog } from "./alert-dialog";
import { Button } from "./button";

const noop = (): void => undefined;

describe("AlertDialog", () => {
  test("is an alertdialog with kit cancel/confirm labels", async () => {
    const onConfirm = mock();
    renderKit(
      <AlertDialog
        description="This cannot be undone."
        onConfirm={onConfirm}
        title="Delete list?"
        tone="danger"
      >
        <Button variant="danger">Delete</Button>
      </AlertDialog>
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(
      screen.getByRole("alertdialog", { name: "Delete list?" })
    ).toBeDefined();
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(classesOf(confirm)).toContain("bg-danger");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("custom labels", () => {
    renderKit(
      <AlertDialog
        cancelLabel="Keep"
        confirmLabel="Remove"
        onConfirm={noop}
        open
        title="Remove?"
      />
    );
    expect(screen.getByRole("button", { name: "Remove" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Keep" })).toBeDefined();
  });

  test("a body between the text and the actions; confirmDisabled", async () => {
    const onConfirm = mock();
    renderKit(
      <AlertDialog
        body={<input aria-label="Type DELETE" />}
        confirmDisabled
        onConfirm={onConfirm}
        open
        title="Delete account?"
      />
    );
    const dialog = screen.getByRole("alertdialog", { name: "Delete account?" });
    expect(dialog.contains(screen.getByLabelText("Type DELETE"))).toBe(true);
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    await userEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
