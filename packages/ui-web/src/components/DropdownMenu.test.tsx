import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import "../test/jsdomShims";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./DropdownMenu";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

function renderMenu(
  props: Partial<{
    modal: boolean;
    onSelect: () => void;
    className: string;
    itemClassName: string;
  }> = {}
) {
  const { modal, onSelect, className, itemClassName } = props;
  return render(
    <>
      <button type="button">Buiten</button>
      <DropdownMenu modal={modal}>
        <DropdownMenuTrigger>Acties</DropdownMenuTrigger>
        <DropdownMenuContent className={className}>
          <DropdownMenuLabel>Gebaar</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem className={itemClassName} onSelect={onSelect}>
              Bewerken
            </DropdownMenuItem>
            <DropdownMenuItem>Dupliceren</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>Verwijderen</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

describe("DropdownMenu", () => {
  it("renders nothing but its trigger while closed", () => {
    renderMenu();
    expect(screen.getByRole("button", { name: "Acties" })).toBeDefined();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on its trigger and lists its items", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Acties" }));

    expect(screen.getByRole("menu")).toBeDefined();
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent)
    ).toEqual(["Bewerken", "Dupliceren", "Verwijderen"]);
  });

  /* The same focus return as `Dialog`'s, for the menu. */
  it("closes on Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "Acties" });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeDefined();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("closes when an item is chosen, reports it and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderMenu({ onSelect });

    const trigger = screen.getByRole("button", { name: "Acties" });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Bewerken" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  /*
   * The non-modal menu leaves the rest of the page clickable, so this one
   * dismissal can be driven through the pointer exactly as a user would.
   */
  it("closes on an outside click and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    renderMenu({ modal: false });

    const trigger = screen.getByRole("button", { name: "Acties" });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Buiten" }));

    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });

  it("opens from the keyboard and highlights the first item", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "Acties" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("menuitem", { name: "Bewerken" })
      );
    });
  });

  it("moves the highlight with the arrow keys", async () => {
    const user = userEvent.setup();
    renderMenu();

    screen.getByRole("button", { name: "Acties" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("menuitem", { name: "Dupliceren" })
      );
    });
  });

  it("does not report a selection from a disabled item", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Acties</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem disabled onSelect={onSelect}>
            Verwijderen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    await user.click(screen.getByRole("menuitem", { name: "Verwijderen" }));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders its menu outside the local container", async () => {
    const user = userEvent.setup();
    const { container } = renderMenu();

    await user.click(screen.getByRole("button", { name: "Acties" }));

    expect(container.contains(screen.getByRole("menu"))).toBe(false);
  });

  it("lets className override a base class on the content", async () => {
    const user = userEvent.setup();
    renderMenu({ className: "bg-red-500" });

    await user.click(screen.getByRole("button", { name: "Acties" }));

    const classes = classesOf(screen.getByRole("menu"));
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-surface-raised");
  });

  it("lets className override a base class on an item", async () => {
    const user = userEvent.setup();
    renderMenu({ itemClassName: "rounded-lg" });

    await user.click(screen.getByRole("button", { name: "Acties" }));

    const classes = classesOf(
      screen.getByRole("menuitem", { name: "Bewerken" })
    );
    expect(classes).toContain("rounded-lg");
    expect(classes).not.toContain("rounded-sm");
  });

  it("edges its menu with the decorative border, not the functional one", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Acties" }));

    const classes = classesOf(screen.getByRole("menu"));
    expect(classes).toContain("border-border-subtle");
    expect(classes).not.toContain("border-border");
  });

  it("spreads arbitrary props onto the content and its items", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Acties</DropdownMenuTrigger>
        <DropdownMenuContent data-testid="menu">
          <DropdownMenuItem data-testid="item">Bewerken</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    await user.click(screen.getByRole("button", { name: "Acties" }));

    expect(screen.getByTestId("menu")).toBe(screen.getByRole("menu"));
    expect(screen.getByTestId("item")).toBe(screen.getByRole("menuitem"));
  });

  it("forwards refs to the content and to an item", async () => {
    const user = userEvent.setup();
    const contentRef = createRef<HTMLDivElement>();
    const itemRef = createRef<HTMLDivElement>();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Acties</DropdownMenuTrigger>
        <DropdownMenuContent ref={contentRef}>
          <DropdownMenuItem ref={itemRef}>Bewerken</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    await user.click(screen.getByRole("button", { name: "Acties" }));

    expect(contentRef.current).toBe(screen.getByRole("menu"));
    expect(itemRef.current).toBe(screen.getByRole("menuitem"));
  });

  it("lets className override a base class on the label and the separator", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Acties</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel className="text-lg">Gebaar</DropdownMenuLabel>
          <DropdownMenuSeparator className="h-1" data-testid="scheiding" />
          <DropdownMenuItem>Bewerken</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    await user.click(screen.getByRole("button", { name: "Acties" }));

    expect(classesOf(screen.getByText("Gebaar"))).toContain("text-lg");
    expect(classesOf(screen.getByText("Gebaar"))).not.toContain("text-sm");
    expect(classesOf(screen.getByTestId("scheiding"))).toContain("h-1");
    expect(classesOf(screen.getByTestId("scheiding"))).not.toContain("h-px");
  });
});
