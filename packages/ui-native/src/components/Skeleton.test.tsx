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

  it("forwards animate-pulse to the element NativeWind resolves", () => {
    /**
     * Named for what it checks, not what it hopes is true: this asserts
     * `Skeleton` still hands `animate-pulse` to NativeWind, not that the
     * animation plays. Asserted on the rendered element, not on
     * `skeletonVariants()` in isolation — a test that only called the `cva`
     * config would still pass if `Skeleton` stopped applying its own classes
     * to anything. This is exactly how `animate-pulse` disappeared once
     * already: the class was dropped and every existing test (all of which
     * check props other than this one) stayed green.
     *
     * Neither this package's mocked `react-native-reanimated` nor
     * `react-native-worklets` make the animation observable through props
     * inspection at any layer checked: the fully-resolved host `View`'s
     * `style` is only `{ borderRadius, backgroundColor }`, no `opacity`; the
     * intermediate `Animated.View` layer's own `style` — where
     * `react-native-css-interop`'s `processAnimations` should attach a
     * reanimated `SharedValue` at `style.opacity` — was checked too and is
     * identical, no `opacity` key either. The mock stops the animation
     * machinery from crashing; it does not make the animation observable in
     * style anywhere in this render tree. `className`, however, survives one
     * layer up: NativeWind wraps `View` in a `CssInterop.View` forwardRef
     * component before resolving classes into style, and that intermediate
     * element's props still carry the literal `className` string.
     * `UNSAFE_getAllByProps` (unlike the default queries) is not restricted
     * to host elements, so it can reach that intermediate node.
     *
     * Known accepted gap: this proves the class survives `Skeleton` down to
     * NativeWind's input; `gate.test.tsx` proves NativeWind's className→style
     * pipeline itself works, for a static colour utility. Neither proves
     * NativeWind's animation-specific path (`processAnimations`, distinct
     * code from the static-style path both traces above went through) still
     * turns `animate-pulse` into a running animation — that would need a
     * real device or a less-mocked runtime than this package's test
     * environment provides, and is deliberately left uncovered rather than
     * pretended at.
     */
    render(<Skeleton testID="subject" />);

    const withClassName = screen
      .UNSAFE_getAllByProps({ testID: "subject" })
      .find((element) => "className" in element.props);

    expect(withClassName?.props.className).toContain("animate-pulse");
  });
});
