import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Label } from "./Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./Select";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

/*
 * Radix's Select content measures itself, so jsdom needs the two browser APIs
 * it has no implementation for. Installed at module scope rather than in a
 * `beforeAll`, because a throw in `beforeAll` fails the file without failing
 * any named test and reads as "skipped".
 */
if (!("ResizeObserver" in globalThis)) {
  Object.assign(globalThis, {
    ResizeObserver: class {
      observe() {
        // jsdom lays nothing out, so there is nothing to observe
      }
      unobserve() {
        // jsdom lays nothing out, so there is nothing to observe
      }
      disconnect() {
        // jsdom lays nothing out, so there is nothing to observe
      }
    },
  });
}
Element.prototype.scrollIntoView ??= () => {
  // jsdom has no scrolling
};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {
  // jsdom has no pointer capture
};

function renderSelect(
  props: Partial<{
    disabled: boolean;
    onValueChange: (value: string) => void;
  }> = {}
) {
  return render(
    <Select {...props}>
      <SelectTrigger>
        <SelectValue placeholder="Kies een categorie" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="begroetingen">Begroetingen</SelectItem>
        <SelectItem value="dieren">Dieren</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe("Select", () => {
  it("renders its trigger with the placeholder", () => {
    renderSelect();
    expect(screen.getByRole("combobox")).toBeDefined();
    expect(screen.getByText("Kies een categorie")).toBeDefined();
  });

  /*
   * `combobox` is a "name from author" role: ARIA does not let it take its
   * accessible name from its own content, so the placeholder names nothing.
   * Asserted rather than assumed, because it is the reason a bare
   * `SelectTrigger` is not a usable control and `Field` (or an explicit
   * `Label`) is not optional here.
   */
  it("gets no accessible name from its placeholder alone", () => {
    renderSelect();
    expect(
      screen.queryByRole("combobox", { name: "Kies een categorie" })
    ).toBeNull();
  });

  it("defaults its trigger to the medium size", () => {
    renderSelect();
    expect(classesOf(screen.getByRole("combobox"))).toContain("h-10");
  });

  it("applies the requested size to the trigger instead of the default", () => {
    render(
      <Select>
        <SelectTrigger size="sm">
          <SelectValue placeholder="Kies" />
        </SelectTrigger>
      </Select>
    );
    const classes = classesOf(screen.getByRole("combobox"));
    expect(classes).toContain("h-8");
    expect(classes).not.toContain("h-10");
  });

  it("lets className override a base class on the trigger", () => {
    render(
      <Select>
        <SelectTrigger className="bg-red-500">
          <SelectValue placeholder="Kies" />
        </SelectTrigger>
      </Select>
    );
    const classes = classesOf(screen.getByRole("combobox"));
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-surface");
  });

  it("keeps the base's non-conflicting classes when className is given", () => {
    render(
      <Select>
        <SelectTrigger className="bg-red-500">
          <SelectValue placeholder="Kies" />
        </SelectTrigger>
      </Select>
    );
    expect(classesOf(screen.getByRole("combobox"))).toContain("w-full");
  });

  it("delimits its trigger with the functional border, not the decorative one", () => {
    renderSelect();
    const classes = classesOf(screen.getByRole("combobox"));
    expect(classes).toContain("border-border");
    expect(classes).not.toContain("border-border-subtle");
  });

  /*
   * Radix's `Select` root is a plain function component with no ref of its
   * own — verified in node_modules/@radix-ui/react-select: `declare const
   * Select: React.FC<SelectProps>`. The trigger is what a caller can reach.
   */
  it("forwards a ref to the trigger button", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Select>
        <SelectTrigger ref={ref}>
          <SelectValue placeholder="Kies" />
        </SelectTrigger>
      </Select>
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("spreads arbitrary props onto the trigger", () => {
    render(
      <Select>
        <SelectTrigger data-testid="categorie">
          <SelectValue placeholder="Kies" />
        </SelectTrigger>
      </Select>
    );
    expect(screen.getByTestId("categorie").getAttribute("role")).toBe(
      "combobox"
    );
  });

  it("reflects a disabled root on its trigger", () => {
    renderSelect({ disabled: true });
    expect(screen.getByRole("combobox")).toHaveProperty("disabled", true);
  });

  it("is not disabled by default", () => {
    renderSelect();
    expect(screen.getByRole("combobox")).toHaveProperty("disabled", false);
  });

  it("is named by a Label that points at its trigger id", () => {
    render(
      <>
        <Label htmlFor="categorie">Categorie</Label>
        <Select>
          <SelectTrigger id="categorie">
            <SelectValue placeholder="Kies" />
          </SelectTrigger>
        </Select>
      </>
    );
    expect(screen.getByLabelText("Categorie")).toBe(
      screen.getByRole("combobox") as HTMLElement
    );
  });

  it("shows its items once opened and reports the chosen value", () => {
    const onValueChange = vi.fn();
    renderSelect({ onValueChange });

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    const option = screen.getByRole("option", { name: "Dieren" });
    expect(option).toBeDefined();

    fireEvent.click(option);
    expect(onValueChange).toHaveBeenCalledWith("dieren");
  });
});
