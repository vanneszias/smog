import { describe, expect, test } from "bun:test";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useCallback, useState } from "react";
import { AlertDialog } from "../../../../../ui-web/src/components/alert-dialog";
import { Button } from "../../../../../ui-web/src/components/button";
import {
  Dialog,
  DialogContent,
} from "../../../../../ui-web/src/components/dialog";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "../../../../../ui-web/src/components/menu";
import {
  Sheet,
  SheetContent,
} from "../../../../../ui-web/src/components/sheet";
import { renderKit } from "../../../../support/ui-web/render";

/*
 * A controlled dialog has no Radix trigger, so Radix had nowhere to put
 * the focus back on close and left it on <body>. The kit returns it to the
 * element that had it when the dialog opened (phase 5 task 7).
 */

function noop(): void {
  // Confirming is not under test.
}

function Controlled({
  kind,
}: {
  kind: "alert" | "dialog" | "sheet";
}): ReactNode {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const opener = <Button onClick={show}>Open</Button>;
  if (kind === "alert") {
    return (
      <>
        {opener}
        <AlertDialog
          onConfirm={noop}
          onOpenChange={setOpen}
          open={open}
          title="Sure?"
        />
      </>
    );
  }
  if (kind === "sheet") {
    return (
      <>
        {opener}
        <Sheet onOpenChange={setOpen} open={open}>
          {open ? <SheetContent title="Panel">Body</SheetContent> : null}
        </Sheet>
      </>
    );
  }
  return (
    <>
      {opener}
      <Dialog onOpenChange={setOpen} open={open}>
        {/* Unmounted on close, as the admin screens render it. */}
        {open ? <DialogContent title="Form">Body</DialogContent> : null}
      </Dialog>
    </>
  );
}

describe("focus return without a trigger", () => {
  for (const kind of ["dialog", "sheet", "alert"] as const) {
    test(`a controlled ${kind} gives the focus back to its opener on Escape`, async () => {
      renderKit(<Controlled kind={kind} />);
      const opener = screen.getByRole("button", { name: "Open" });
      opener.focus();
      await userEvent.keyboard("{Enter}");
      const role = kind === "alert" ? "alertdialog" : "dialog";
      await waitFor(() => expect(screen.getByRole(role)).toBeTruthy());
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole(role)).toBeNull());
      // Radix restores focus after a tick.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(document.activeElement).toBe(opener);
    });
  }
});

function FromMenu(): ReactNode {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button>Actions</Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={show}>Rename</MenuItem>
        </MenuContent>
      </Menu>
      <Dialog onOpenChange={setOpen} open={open}>
        {open ? <DialogContent title="Form">Body</DialogContent> : null}
      </Dialog>
    </>
  );
}

describe("focus return from a menu item", () => {
  test("a dialog opened by a menu item returns the focus to the menu's button", async () => {
    renderKit(<FromMenu />);
    const trigger = screen.getByRole("button", { name: "Actions" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(document.activeElement).toBe(trigger);
  });
});
