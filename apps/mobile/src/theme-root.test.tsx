import { describe, expect, it, jest } from "@jest/globals";
import { themeVars } from "@smog/styles/native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mockScheme: { current: "light" | "dark" | undefined } = {
  current: "light",
};

jest.mock("nativewind", () => {
  const actual = jest.requireActual<typeof import("nativewind")>("nativewind");
  return {
    ...actual,
    useColorScheme: () => ({
      colorScheme: mockScheme.current,
      setColorScheme: jest.fn(),
      toggleColorScheme: jest.fn(),
    }),
  };
});

// Imported after the mock so the component sees the mocked hook.
const { ThemeRoot } = require("./theme-root") as typeof import("./theme-root");

function rootStyle(): unknown {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(<ThemeRoot>{null}</ThemeRoot>);
  });
  const root = renderer?.root.findByProps({ testID: "theme-root" });
  return root?.props.style;
}

describe("ThemeRoot", () => {
  it("applies the dark colour variables in dark mode", () => {
    mockScheme.current = "dark";
    expect(rootStyle()).toBe(themeVars.dark);
  });

  it("applies the light colour variables in light mode", () => {
    mockScheme.current = "light";
    expect(rootStyle()).toBe(themeVars.light);
  });

  it("falls back to light before the scheme is known", () => {
    mockScheme.current = undefined;
    expect(rootStyle()).toBe(themeVars.light);
  });
});
