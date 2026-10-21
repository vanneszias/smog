import { describe, expect, it } from "@jest/globals";
import { screen } from "@testing-library/react-native";
// biome-ignore lint/performance/noNamespaceImport: the test walks every export of the kit
import * as kit from "./index";
import { CASES, ID } from "./test/kit-cases";
import { renderKit } from "./test/render";

const COMPONENT_NAME = /^[A-Z]/;

describe("the kit contract", () => {
  it.each(Object.entries(CASES))(
    "%s passes testID to a host element",
    async (_name, element) => {
      await renderKit(element);
      expect(
        screen.getByTestId(ID, { includeHiddenElements: true })
      ).toBeTruthy();
    }
  );

  it("covers every exported component", () => {
    const components = Object.entries(kit)
      .filter(
        ([name, value]) =>
          COMPONENT_NAME.test(name) &&
          typeof value === "function" &&
          !name.endsWith("Provider")
      )
      .map(([name]) => name);
    // Roots and triggers render no element of their own.
    const passThrough = new Set([
      "Dialog",
      "DialogClose",
      "DialogTrigger",
      "Menu",
      "MenuTrigger",
      "Popover",
      "PopoverClose",
      "PopoverTrigger",
      "Sheet",
      "SheetClose",
      "SheetTrigger",
      "Tabs",
    ]);
    const untested = components.filter(
      (name) => !(name in CASES || passThrough.has(name))
    );
    expect(untested).toEqual([]);
  });
});
