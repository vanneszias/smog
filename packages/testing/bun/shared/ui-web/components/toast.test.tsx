import { describe, expect, test } from "bun:test";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useCallback } from "react";
import { Button } from "../../../../../ui-web/src/components/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "../../../../../ui-web/src/components/dialog";
import {
  ToastProvider,
  useToast,
} from "../../../../../ui-web/src/components/toast";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

const NOTIFICATIONS = /Notifications/;

function Trigger(): ReactNode {
  const { toast } = useToast();
  const show = useCallback(
    () =>
      toast({
        description: "Added to Favorites.",
        title: "Saved",
        variant: "success",
      }),
    [toast]
  );
  return <Button onClick={show}>Save</Button>;
}

describe("Toast", () => {
  test("useToast shows a toast in the labelled region; it can be dismissed", async () => {
    renderKit(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    expect(screen.getByRole("region", { name: NOTIFICATIONS })).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const title = screen.getByText("Saved");
    const toast = title.closest('[data-slot="toast"]');
    expect(toast).not.toBeNull();
    expect(classesOf(toast)).toContain("shadow-3");
    expect(screen.getByText("Added to Favorites.")).toBeDefined();
    // Sonner's polite live region announces it to a screen reader (inventory P-29).
    expect(
      document.querySelector('section[aria-live="polite"]')
    ).not.toBeNull();
    await act(async () => {
      await userEvent.click(
        screen.getByRole("button", { name: "Dismiss notification" })
      );
    });
    // Sonner unmounts a toast once its exit transition is over.
    // (A cheap throw: a failed `expect` on a DOM node makes bun format the
    // whole node, which takes seconds per poll.)
    await waitFor(() => {
      if (screen.queryByText("Saved")) {
        throw new Error("the toast is still shown");
      }
    });
  });

  test("useToast outside the provider throws", () => {
    expect(() => renderKit(<Trigger />)).toThrow();
  });

  test("a toast does not outlive its provider (sonner's store is global)", async () => {
    const first = renderKit(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Saved")).toBeDefined();
    first.unmount();
    renderKit(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    // The replay (if any) lands in an effect of the new Toaster.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByText("Saved")).toBeNull();
  });

  test("a toast raised while a modal is open stays in the accessibility tree", async () => {
    function Failing(): ReactNode {
      const { toast } = useToast();
      const fail = useCallback(
        () =>
          toast({
            description: "Try again.",
            title: "Could not save",
            variant: "danger",
          }),
        [toast]
      );
      return <Button onClick={fail}>Fail</Button>;
    }
    renderKit(
      <ToastProvider>
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open</Button>
          </DialogTrigger>
          <DialogContent title="Edit">
            <Failing />
          </DialogContent>
        </Dialog>
      </ToastProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("dialog", { name: "Edit" })).toBeDefined();
    // The rest of the page is out of the accessibility tree while the modal
    // is open (Radix's `hideOthers`)...
    expect(
      screen.getByText("Open").closest("[aria-hidden='true']")
    ).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Fail" }));
    // ...but `hideOthers` keeps every `aria-live` region (sonner's), so the
    // toast is still spoken: the region, with the toast in it, has no
    // hidden ancestor and is not hidden itself. A change of Radix or sonner
    // that broke this would silence every toast raised from a modal.
    const region = screen.getByRole("region", {
      hidden: true,
      name: NOTIFICATIONS,
    });
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(
      region.closest("[aria-hidden='true'], [hidden], [inert]")
    ).toBeNull();
    expect(region.textContent).toContain("Could not save");
    expect(region.querySelector("[role='alert']")).not.toBeNull();
  });
});
