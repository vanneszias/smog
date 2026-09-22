import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Banner } from "./Banner";

const metrics = {
  frame: { height: 800, width: 400, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 47 },
};

function renderBanner(props: Partial<Parameters<typeof Banner>[0]> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Banner label="Analytics" {...props}>
        <Text>body</Text>
      </Banner>
    </SafeAreaProvider>
  );
}

describe("Banner", () => {
  it("renders its children in a labelled region", () => {
    renderBanner();
    const root = screen.getByTestId("root");
    expect(root.props.role).toBe("region");
    expect(root.props.accessibilityLabel).toBe("Analytics");
    expect(screen.getByText("body")).toBeTruthy();
  });

  it("is not a modal: nothing in its tree is an RN Modal", () => {
    const { UNSAFE_queryAllByType } = renderBanner();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Modal } = require("react-native");
    expect(UNSAFE_queryAllByType(Modal)).toHaveLength(0);
  });

  it("pads itself by the bottom safe-area inset it sits on", () => {
    renderBanner();
    const style = [screen.getByTestId("root").props.style].flat(
      Number.POSITIVE_INFINITY
    );
    expect(style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ paddingBottom: 34 + 16 }),
      ])
    );
  });
});
