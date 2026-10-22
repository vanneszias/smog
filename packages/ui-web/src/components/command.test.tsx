import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderKit } from "../test/render";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";

// cmdk scrolls the selected item into view and watches its list with a
// ResizeObserver; happy-dom has neither. The stubs live for this file only
// (sonner and Radix in other files must not see a fake ResizeObserver).
class NoopResizeObserver {
  disconnect(): void {
    // nothing to observe in a test
  }
  observe(): void {
    // nothing to observe in a test
  }
  unobserve(): void {
    // nothing to observe in a test
  }
}
const original = {
  resizeObserver: globalThis.ResizeObserver,
  scrollIntoView: Element.prototype.scrollIntoView,
};

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  globalThis.ResizeObserver = NoopResizeObserver;
});

afterAll(() => {
  Element.prototype.scrollIntoView = original.scrollIntoView;
  globalThis.ResizeObserver = original.resizeObserver;
});

describe("Command", () => {
  test("filters as you type, selects an item and says when nothing matches", async () => {
    const onSelect = mock();
    renderKit(
      <Command>
        <CommandInput />
        <CommandList>
          <CommandEmpty />
          <CommandGroup heading="Gestures">
            <CommandItem onSelect={onSelect}>Hello</CommandItem>
            <CommandItem>Thank you</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    );
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("placeholder")).toBe("Type a command or search…");
    // cmdk's own English labels ("Suggestions", "Command Menu") come from i18n.
    expect(screen.getByRole("listbox", { name: "Suggestions" })).toBeDefined();
    await userEvent.type(input, "hel");
    expect(screen.queryByText("Thank you")).toBeNull();
    await userEvent.click(screen.getByRole("option", { name: "Hello" }));
    expect(onSelect).toHaveBeenCalled();
    await userEvent.clear(input);
    await userEvent.type(input, "zzz");
    expect(screen.getByText("No results")).toBeDefined();
  });

  test("the dialog is named and opens on demand", () => {
    renderKit(
      <CommandDialog open>
        <Command>
          <CommandInput />
          <CommandList />
        </Command>
      </CommandDialog>
    );
    expect(screen.getByRole("dialog", { name: "Search" })).toBeDefined();
  });
});
