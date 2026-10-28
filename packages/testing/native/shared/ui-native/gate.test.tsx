import { describe, expect, it } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { type ReactElement, useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

/**
 * The premise of the kit's style assertions: a preset class written on an
 * RN element arrives as a style under this runner.
 */
describe("the NativeWind transform under Jest", () => {
  it("turns preset classes into styles", async () => {
    await render(<View className="min-h-touch rounded-md p-4" testID="box" />);
    expect(screen.getByTestId("box")).toHaveStyle({
      borderRadius: 10,
      minHeight: 44,
      padding: 16,
    });
  });
});

function GainsColour(): ReactElement {
  const [on, setOn] = useState(false);
  const press = useCallback((): void => {
    setOn(true);
  }, []);
  return (
    <Pressable
      accessibilityRole="button"
      className={on ? "border-primary border-b-2" : "border-b-2"}
      onPress={press}
    >
      <Text>Tab</Text>
    </Pressable>
  );
}

describe("the preset's colour classes", () => {
  it("can be added after the first render", async () => {
    // With Tailwind's `--tw-*-opacity` variables this remounted the view
    // (and looped under the test renderer); the preset turns them off.
    await render(<GainsColour />);
    await fireEvent.press(screen.getByRole("button", { name: "Tab" }));
    expect(screen.getByRole("button", { name: "Tab" })).toBeOnTheScreen();
  });
});
