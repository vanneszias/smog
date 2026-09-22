import { tokens } from "@smog/styles";
import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { resolvedColor } from "../test/resolvedColor";
import { Card } from "./Card";

describe("Card", () => {
  it("renders its children", () => {
    const { getByText } = render(
      <Card>
        <Text>Contents</Text>
      </Card>
    );

    expect(getByText("Contents")).toBeOnTheScreen();
  });

  it("changes the border role between static and interactive", () => {
    /**
     * Asserted as two different colours, not one: `border-border-subtle`
     * (decoration) versus `border-border` (functional) is a choice between
     * two roles, and a test that only checked the interactive card's colour
     * would not notice both variants quietly sharing one border colour.
     */
    const staticCard = render(
      <Card testID="static">
        <Text>Contents</Text>
      </Card>
    );
    const interactiveCard = render(
      <Card interactive testID="interactive">
        <Text>Contents</Text>
      </Card>
    );

    const subtle = resolvedColor(tokens.semantic.light.borderSubtle);
    const functional = resolvedColor(tokens.semantic.light.border);

    expect(staticCard.getByTestId("static")).toHaveStyle({
      borderColor: subtle,
    });
    expect(interactiveCard.getByTestId("interactive")).toHaveStyle({
      borderColor: functional,
    });
    expect(subtle).not.toBe(functional);
  });
});
