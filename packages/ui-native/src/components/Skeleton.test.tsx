import { render, screen } from "@testing-library/react-native";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("renders", () => {
    render(<Skeleton testID="subject" />);

    expect(screen.getByTestId("subject")).toBeOnTheScreen();
  });

  it("is hidden from assistive technology", () => {
    /**
     * A loading placeholder announced as content is worse than silence — a
     * screen reader that walks into a dozen pulsing rectangles hears a dozen
     * blank groups.
     */
    render(<Skeleton testID="subject" />);

    expect(screen.getByTestId("subject")).toHaveProp(
      "accessibilityElementsHidden",
      true
    );
    expect(screen.getByTestId("subject")).toHaveProp(
      "importantForAccessibility",
      "no-hide-descendants"
    );
  });
});
