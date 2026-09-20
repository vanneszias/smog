import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import "../test/jsdomShims";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./Sheet";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

type SheetSide = "top" | "right" | "bottom" | "left";

function renderSheet(
  props: Partial<{
    side: SheetSide;
    closeLabel: string;
    showClose: boolean;
    className: string;
  }> = {}
) {
  return render(
    <Sheet>
      <SheetTrigger>Menu</SheetTrigger>
      <SheetContent {...props}>
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Verfijn de lijst met gebaren.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose>Toepassen</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

describe("Sheet", () => {
  it("renders nothing but its trigger while closed", () => {
    renderSheet();
    expect(screen.getByRole("button", { name: "Menu" })).toBeDefined();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on its trigger", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole("button", { name: "Menu" }));

    expect(screen.getByRole("dialog", { name: "Filters" })).toBeDefined();
  });

  /* Review Focus item 4, for the side-anchored variant. */
  it("closes on Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    renderSheet();

    const trigger = screen.getByRole("button", { name: "Menu" });
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

  it("closes on its own close button and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    renderSheet();

    const trigger = screen.getByRole("button", { name: "Menu" });
    await user.click(trigger);

    await user.click(screen.getByRole("button", { name: "Sluiten" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("closes on a click on its scrim and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    renderSheet();

    const trigger = screen.getByRole("button", { name: "Menu" });
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

  /*
   * The `side` variant is the whole reason this component is not `Dialog`:
   * the mobile navigation and the filter panel both need an edge-anchored
   * panel, and a centred one is wrong for both.
   */
  it("anchors itself to the right by default", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole("button", { name: "Menu" }));

    const classes = classesOf(screen.getByRole("dialog"));
    expect(classes).toContain("right-0");
    expect(classes).toContain("inset-y-0");
    expect(classes).not.toContain("left-0");
  });

  it("anchors itself to the left when asked", async () => {
    const user = userEvent.setup();
    renderSheet({ side: "left" });

    await user.click(screen.getByRole("button", { name: "Menu" }));

    const classes = classesOf(screen.getByRole("dialog"));
    expect(classes).toContain("left-0");
    expect(classes).not.toContain("right-0");
  });

  it("anchors itself to the top when asked", async () => {
    const user = userEvent.setup();
    renderSheet({ side: "top" });

    await user.click(screen.getByRole("button", { name: "Menu" }));

    const classes = classesOf(screen.getByRole("dialog"));
    expect(classes).toContain("top-0");
    expect(classes).toContain("inset-x-0");
    expect(classes).not.toContain("inset-y-0");
  });

  it("anchors itself to the bottom when asked", async () => {
    const user = userEvent.setup();
    renderSheet({ side: "bottom" });

    await user.click(screen.getByRole("button", { name: "Menu" }));

    const classes = classesOf(screen.getByRole("dialog"));
    expect(classes).toContain("bottom-0");
    expect(classes).not.toContain("top-0");
  });

  it("renders its content outside the local container", async () => {
    const user = userEvent.setup();
    const { container } = renderSheet();

    await user.click(screen.getByRole("button", { name: "Menu" }));

    expect(container.contains(screen.getByRole("dialog"))).toBe(false);
  });

  it("lets className override a base class on the content", async () => {
    const user = userEvent.setup();
    renderSheet({ className: "bg-red-500" });

    await user.click(screen.getByRole("button", { name: "Menu" }));

    const classes = classesOf(screen.getByRole("dialog"));
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-surface-raised");
  });

  /*
   * `left-4` and not `right-0`: tailwind-merge treats `left-*` and `right-*`
   * as separate groups, so a `right-0` would sit happily beside the variant's
   * `left-0` and the assertion would be testing nothing.
   */
  it("lets className override the side variant's own class", async () => {
    const user = userEvent.setup();
    renderSheet({ side: "left", className: "left-4" });

    await user.click(screen.getByRole("button", { name: "Menu" }));

    const classes = classesOf(screen.getByRole("dialog"));
    expect(classes).toContain("left-4");
    expect(classes).not.toContain("left-0");
  });

  it("edges its panel with the decorative border, not the functional one", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole("button", { name: "Menu" }));

    const classes = classesOf(screen.getByRole("dialog"));
    expect(classes).toContain("border-border-subtle");
    expect(classes).not.toContain("border-border");
  });

  it("lets a caller rename the close button", async () => {
    const user = userEvent.setup();
    renderSheet({ closeLabel: "Close" });

    await user.click(screen.getByRole("button", { name: "Menu" }));

    expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Sluiten" })).toBeNull();
  });

  it("omits the close button when showClose is false", async () => {
    const user = userEvent.setup();
    renderSheet({ showClose: false });

    await user.click(screen.getByRole("button", { name: "Menu" }));

    expect(screen.queryByRole("button", { name: "Sluiten" })).toBeNull();
  });

  it("spreads arbitrary props onto the content", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger>Menu</SheetTrigger>
        <SheetContent data-testid="paneel">
          <SheetTitle>Filters</SheetTitle>
        </SheetContent>
      </Sheet>
    );

    await user.click(screen.getByRole("button", { name: "Menu" }));

    expect(screen.getByTestId("paneel")).toBe(screen.getByRole("dialog"));
  });

  it("forwards a ref to the content element", async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLDivElement>();
    render(
      <Sheet>
        <SheetTrigger>Menu</SheetTrigger>
        <SheetContent ref={ref}>
          <SheetTitle>Filters</SheetTitle>
        </SheetContent>
      </Sheet>
    );

    await user.click(screen.getByRole("button", { name: "Menu" }));

    expect(ref.current).toBe(screen.getByRole("dialog"));
  });

  it("describes the panel from its description", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Verfijn de lijst.</SheetDescription>
        </SheetContent>
      </Sheet>
    );

    const describedBy = screen
      .getByRole("dialog")
      .getAttribute("aria-describedby");
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe(
      "Verfijn de lijst."
    );
  });

  it("lets className override a base class on the header and footer", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetHeader className="gap-6" data-testid="kop">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <SheetFooter className="flex-col" data-testid="voet" />
        </SheetContent>
      </Sheet>
    );

    expect(classesOf(screen.getByTestId("kop"))).toContain("gap-6");
    expect(classesOf(screen.getByTestId("kop"))).not.toContain("gap-2");
    expect(classesOf(screen.getByTestId("voet"))).toContain("flex-col");
    expect(classesOf(screen.getByTestId("voet"))).not.toContain(
      "flex-col-reverse"
    );
  });
});
