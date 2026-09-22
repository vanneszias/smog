import { tokens } from "@smog/styles";
import { render, screen } from "@testing-library/react-native";
import { resolvedColor } from "../test/resolvedColor";
import { Input } from "./Input";

describe("Input", () => {
  it("renders", () => {
    render(<Input label="Email" />);

    expect(screen.getByLabelText("Email")).toBeOnTheScreen();
  });

  it("has an accessible name from label without rendering a visible label", () => {
    /**
     * `accessibilityLabel` is the only name a `TextInput` gets on iOS — there
     * is no `<label for>` on a phone. Asserting the name exists is only half
     * the point; asserting no visible "Email" text node also exists is what
     * proves the name did not come from a rendered label a caller has to add
     * separately.
     */
    render(<Input label="Email" />);

    expect(screen.getByLabelText("Email")).toBeOnTheScreen();
    expect(screen.queryByText("Email")).not.toBeOnTheScreen();
  });

  it("sets accessibilityState.invalid, not only a border colour", () => {
    const valid = render(<Input label="Email" testID="valid" />);
    const invalid = render(<Input invalid label="Email" testID="invalid" />);

    expect(valid.getByTestId("valid")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ invalid: false })
    );
    expect(invalid.getByTestId("invalid")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ invalid: true })
    );

    expect(invalid.getByTestId("invalid")).toHaveStyle({
      borderColor: resolvedColor(tokens.semantic.light.danger),
    });
    expect(valid.getByTestId("valid")).not.toHaveStyle({
      borderColor: resolvedColor(tokens.semantic.light.danger),
    });
  });
});
