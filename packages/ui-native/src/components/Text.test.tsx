import { tokens } from "@smog/styles";
import { render, screen } from "@testing-library/react-native";
import { resolvedColor } from "../test/resolvedColor";
import { Text } from "./Text";

describe("Text", () => {
  it("renders its children", () => {
    render(<Text>Hello</Text>);

    expect(screen.getByText("Hello")).toBeOnTheScreen();
  });

  it("paints a muted variant differently from the body variant", () => {
    /**
     * The pair, not one assertion: a test that only checked "muted" against
     * the semantic muted token would still pass if `variant` were wired to
     * nothing at all and both defaulted to the same colour. Asserting the two
     * variants differ from each other is what actually exercises the prop.
     */
    const body = render(<Text testID="body">Body</Text>);
    const muted = render(
      <Text testID="muted" variant="muted">
        Muted
      </Text>
    );

    const bodyColor = resolvedColor(tokens.semantic.light.foreground);
    const mutedColor = resolvedColor(tokens.semantic.light.foregroundMuted);

    expect(body.getByTestId("body")).toHaveStyle({ color: bodyColor });
    expect(muted.getByTestId("muted")).toHaveStyle({ color: mutedColor });
    expect(bodyColor).not.toBe(mutedColor);
  });
});
