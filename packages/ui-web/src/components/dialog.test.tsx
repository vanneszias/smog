import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classesOf, renderKit } from "../test/render";
import { Button } from "./button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "./dialog";

describe("Dialog", () => {
  test("opens from its trigger as a named, described dialog with a close button", async () => {
    const onOpenChange = mock();
    renderKit(
      <Dialog onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogContent description="Share this list." title="Share">
          <p>Body</p>
          <DialogFooter>
            <Button>Copy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Share" });
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(classesOf(dialog)).toContain("shadow-2");
    expect(classesOf(dialog)).toContain("motion-reduce:animate-none");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
