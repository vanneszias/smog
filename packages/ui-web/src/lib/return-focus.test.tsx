import { describe, expect, test } from "bun:test";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useCallback, useState } from "react";
import { AlertDialog } from "../components/alert-dialog";
import { Button } from "../components/button";
import { Dialog, DialogContent } from "../components/dialog";
import { Sheet, SheetContent } from "../components/sheet";
import { renderKit } from "../test/render";

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
