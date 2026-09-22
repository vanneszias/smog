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
});
