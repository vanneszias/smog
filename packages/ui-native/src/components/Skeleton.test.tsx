import { render, screen } from "@testing-library/react-native";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("renders", () => {
    render(<Skeleton testID="subject" />);

    expect(
      screen.getByTestId("subject", { includeHiddenElements: true })
    ).toBeOnTheScreen();
  });

  it("is hidden from assistive technology", () => {
    /**
     * A loading placeholder announced as content is worse than silence — a
     * screen reader that walks into a dozen pulsing rectangles hears a dozen
     * blank groups. `includeHiddenElements` is required here because that is
     * exactly what these props cause a default query to exclude — the same
     * reason `contract.test.tsx`'s shared query passes it too.
     */
    render(<Skeleton testID="subject" />);

    expect(
      screen.getByTestId("subject", { includeHiddenElements: true })
    ).toHaveProp("accessibilityElementsHidden", true);
    expect(
      screen.getByTestId("subject", { includeHiddenElements: true })
    ).toHaveProp("importantForAccessibility", "no-hide-descendants");
  });

  it("applies the pulse animation", () => {
    /**
     * Asserted on the rendered element, not on `skeletonVariants()` in
     * isolation — a test that only called the `cva` config would still pass
     * if `Skeleton` stopped applying its own classes to anything. This is
     * exactly how `animate-pulse` disappeared once already: the class was
     * dropped and every existing test (all of which check props other than
     * this one) stayed green.
     *
     * The fully-resolved host `View`'s `style` carries no trace of the
     * animation under this package's mocked `react-native-reanimated`/
     * `react-native-worklets` (verified by inspection: its `style` prop is
     * only `{ borderRadius, backgroundColor }`, no `opacity` or animated
     * value of any kind) — the mock stops the animation machinery from
     * crashing, it does not make the animation observable in the final
     * style. `className`, however, survives one layer up: NativeWind's
     * runtime wraps `View` in a `CssInterop.View` forwardRef component
     * before resolving classes into style, and that intermediate element's
     * props still carry the literal `className` string. `UNSAFE_getAllByProps`
     * (unlike the default queries) is not restricted to host elements, so it
     * can reach that intermediate node.
     */
    render(<Skeleton testID="subject" />);

    const withClassName = screen
      .UNSAFE_getAllByProps({ testID: "subject" })
      .find((element) => "className" in element.props);

    expect(withClassName?.props.className).toContain("animate-pulse");
  });
});
