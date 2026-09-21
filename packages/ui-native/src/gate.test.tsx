import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";

/**
 * The gate. This asserts one thing and it is the whole premise of the
 * package: a Tailwind class written on a React Native element arrives at
 * that element as a real style object, under this test runner.
 *
 * If it fails, `packages/ui-native` becomes a `StyleSheet.create` factory
 * over the same `tokens` and nothing else about Stage 8 changes.
 *
 * The expected value is `rgba(0, 128, 95, 1)`, not the `#00805F` hex
 * literal `tailwind.config.js` declares. Tailwind v3 compiles every color
 * utility through a `--tw-bg-opacity` custom property (so `bg-primary/50`
 * can work later), and NativeWind's compiler resolves that at runtime into
 * an rgba() string rather than preserving the hex. The color is still
 * #00805F; only its serialized form changes. See task-1-report.md.
 */
describe("the NativeWind transform", () => {
  it("turns a className into a style", () => {
    render(
      <View className="bg-primary" testID="subject">
        <Text>gate</Text>
      </View>
    );

    expect(screen.getByTestId("subject")).toHaveStyle({
      backgroundColor: "rgba(0, 128, 95, 1)",
    });
  });

  it("reports a different colour for a different class", () => {
    render(<View className="bg-white" testID="subject" />);

    expect(screen.getByTestId("subject")).not.toHaveStyle({
      backgroundColor: "rgba(0, 128, 95, 1)",
    });
  });
});
