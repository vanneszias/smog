import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import "../test/jsdomShims";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./Dialog";

/*
 * Split list, never a substring: the content carries `border-border-subtle`,
 * and `"border-border-subtle".includes("border-border")` is true, so the
 * substring form of these assertions passes on exactly the markup it is meant
 * to reject.
 */
const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

function renderDialog(
  props: Partial<{
    closeLabel: string;
    showClose: boolean;
    className: string;
  }> = {}
) {
  return render(
    <Dialog>
      <DialogTrigger>Openen</DialogTrigger>
      <DialogContent {...props}>
        <DialogHeader>
          <DialogTitle>Gebaar verwijderen</DialogTitle>
          <DialogDescription>
            Dit kan niet ongedaan worden gemaakt.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose>Annuleren</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("renders nothing but its trigger while closed", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Openen" })).toBeDefined();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on its trigger", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Openen" }));

    expect(screen.getByRole("dialog")).toBeDefined();
  });

  /*
   * Closing is the half everyone tests; returning focus to the trigger is the
   * half that makes the overlay usable by keyboard, and it is the half that
   * silently disappears. A test that only asserted the
   * content had gone would pass against a dialog that drops the user at the
   * top of the document.
   */
  it("closes on Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    renderDialog();

    const trigger = screen.getByRole("button", { name: "Openen" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeDefined();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  /*
   * The close button is ours, not Radix's — a bare `Dialog.Content` renders
   * no such control — so this is the one close path in this file that tests
   * this package rather than the primitive underneath it.
   */
  it("closes on its own close button and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    renderDialog();

    const trigger = screen.getByRole("button", { name: "Openen" });
    await user.click(trigger);

    await user.click(screen.getByRole("button", { name: "Sluiten" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("closes on a DialogClose in its own content and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    renderDialog();

    const trigger = screen.getByRole("button", { name: "Openen" });
    await user.click(trigger);

    await user.click(screen.getByRole("button", { name: "Annuleren" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  /*
   * The overlay is the outside. A modal dialog turns `pointer-events` off on
   * the body, so the scrim is the only thing a user can actually press out
   * there — which is why `DialogContent` mounting one is not decoration, and
   * why this is driven through the pointer rather than by a synthesised
   * event. (Radix 1.1.23 defers the dismissal to the `click`, not the
   * `pointerdown`, so a lone dispatched `pointerdown` would prove nothing.)
   */
  it("closes on a click outside it and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    renderDialog();

    const trigger = screen.getByRole("button", { name: "Openen" });
    await user.click(trigger);
    const overlay = screen.getByRole("dialog").previousElementSibling;

    await user.click(overlay as Element);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("names its close button in Dutch by default", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Openen" }));

    expect(screen.getByRole("button", { name: "Sluiten" })).toBeDefined();
  });

  it("lets a caller rename the close button", async () => {
    const user = userEvent.setup();
    renderDialog({ closeLabel: "Close" });

    await user.click(screen.getByRole("button", { name: "Openen" }));

    expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Sluiten" })).toBeNull();
  });

  it("omits the close button when showClose is false", async () => {
    const user = userEvent.setup();
    renderDialog({ showClose: false });

    await user.click(screen.getByRole("button", { name: "Openen" }));

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Sluiten" })).toBeNull();
  });

  it("hides the close icon from assistive technology", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Openen" }));

    const icon = screen
      .getByRole("button", { name: "Sluiten" })
      .querySelector("svg");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("names the dialog from its title", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Openen" }));

    expect(
      screen.getByRole("dialog", { name: "Gebaar verwijderen" })
    ).toBeDefined();
  });

  it("describes the dialog from its description", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Openen" }));

    const dialog = screen.getByRole("dialog");
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe(
      "Dit kan niet ongedaan worden gemaakt."
    );
  });

  /*
   * Ours, not Radix's: `DialogContent` portals itself and mounts the overlay,
   * so a caller cannot forget either. A bare `Dialog.Content` renders inline
   * and unshielded.
   */
  it("renders its content outside the local container", async () => {
    const user = userEvent.setup();
    const { container } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Openen" }));

    const dialog = screen.getByRole("dialog");
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("mounts an overlay immediately before its content", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Openen" }));

    const overlay = screen.getByRole("dialog").previousElementSibling;
    expect(overlay).not.toBeNull();
    expect(classesOf(overlay as Element)).toContain("fixed");
  });

  it("lets className override a base class on the content", async () => {
    const user = userEvent.setup();
    renderDialog({ className: "bg-red-500" });

    await user.click(screen.getByRole("button", { name: "Openen" }));

    const classes = classesOf(screen.getByRole("dialog"));
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-surface-raised");
  });

  /*
   * A popup's own edge is decoration — the raised surface and the shadow
   * already say where it is — which is the one place `border-subtle` is
   * correct. Pinned so the functional role cannot drift in here.
   */
  it("edges its content with the decorative border, not the functional one", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Openen" }));

    const classes = classesOf(screen.getByRole("dialog"));
    expect(classes).toContain("border-border-subtle");
    expect(classes).not.toContain("border-border");
  });

  it("spreads arbitrary props onto the content", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Openen</DialogTrigger>
        <DialogContent data-testid="paneel">
          <DialogTitle>Titel</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    await user.click(screen.getByRole("button", { name: "Openen" }));

    expect(screen.getByTestId("paneel")).toBe(screen.getByRole("dialog"));
  });

  it("forwards a ref to the content element", async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLDivElement>();
    render(
      <Dialog>
        <DialogTrigger>Openen</DialogTrigger>
        <DialogContent ref={ref}>
          <DialogTitle>Titel</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    await user.click(screen.getByRole("button", { name: "Openen" }));

    expect(ref.current).toBe(screen.getByRole("dialog"));
  });

  it("lets className override a base class on the header, footer, title and description", () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader className="gap-6" data-testid="kop">
            <DialogTitle className="text-sm">Titel</DialogTitle>
            <DialogDescription className="text-lg">Uitleg</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col" data-testid="voet" />
        </DialogContent>
      </Dialog>
    );

    expect(classesOf(screen.getByTestId("kop"))).toContain("gap-6");
    expect(classesOf(screen.getByTestId("kop"))).not.toContain("gap-2");
    expect(classesOf(screen.getByText("Titel"))).toContain("text-sm");
    expect(classesOf(screen.getByText("Titel"))).not.toContain("text-lg");
    expect(classesOf(screen.getByText("Uitleg"))).toContain("text-lg");
    expect(classesOf(screen.getByText("Uitleg"))).not.toContain("text-sm");
    expect(classesOf(screen.getByTestId("voet"))).toContain("flex-col");
    expect(classesOf(screen.getByTestId("voet"))).not.toContain(
      "flex-col-reverse"
    );
  });

  it("renders its title as a heading", () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Gebaar verwijderen</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    expect(
      screen.getByRole("heading", { name: "Gebaar verwijderen" })
    ).toBeDefined();
  });
});
