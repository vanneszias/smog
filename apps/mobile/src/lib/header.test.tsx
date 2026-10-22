import { describe, expect, it } from "@jest/globals";
import { tokens } from "@smog/styles/tokens";
import type { ReactElement } from "react";
import { act, create } from "react-test-renderer";
import { type StackHeaderOptions, useStackHeaderOptions } from "./header";

function headerOptions(): StackHeaderOptions {
  let options: StackHeaderOptions | undefined;
  function Probe(): ReactElement | null {
    options = useStackHeaderOptions();
    return null;
  }
  act(() => {
    create(<Probe />);
  });
  if (!options) {
    throw new Error("The probe did not render");
  }
  return options;
}

describe("useStackHeaderOptions", () => {
  const { light } = tokens.color;

  it("paints the header with the deeper green and everything on it white", () => {
    const options = headerOptions();
    expect(options.headerStyle.backgroundColor).toBe(light.sidebar);
    expect(options.headerTintColor).toBe(light.sidebarForeground);
    expect(options.headerTitleStyle.color).toBe(light.sidebarForeground);
    expect(options.headerLargeTitleStyle.color).toBe(light.sidebarForeground);
    // iOS paints the expanded large title on its own background.
    expect(options.headerLargeStyle.backgroundColor).toBe(light.sidebar);
  });

  it("keeps the page below on the page background", () => {
    expect(headerOptions().contentStyle.backgroundColor).toBe(light.background);
  });
});
