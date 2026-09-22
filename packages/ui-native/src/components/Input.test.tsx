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

  it("changes the border colour when invalid, independently of any message", () => {
    const valid = render(<Input label="Email" testID="valid" />);
    const invalid = render(<Input invalid label="Email" testID="invalid" />);

    expect(invalid.getByTestId("invalid")).toHaveStyle({
      borderColor: resolvedColor(tokens.semantic.light.danger),
    });
    expect(valid.getByTestId("valid")).not.toHaveStyle({
      borderColor: resolvedColor(tokens.semantic.light.danger),
    });
  });

  it("surfaces an error message as an accessibility hint and as visible text", () => {
    /**
     * `accessibilityState` has no `invalid` key that either platform's
     * accessibility consumer reads (see the comment in `Input.tsx`, verified
     * against the installed `react-native` source) — so an error is carried
     * by `accessibilityHint`, a prop both VoiceOver and TalkBack actually
     * announce, and mirrored as text for a sighted user.
     */
    render(<Input errorMessage="Enter a valid email" label="Email" />);

    expect(screen.getByLabelText("Email")).toHaveProp(
      "accessibilityHint",
      "Enter a valid email"
    );
    expect(screen.getByText("Enter a valid email")).toBeOnTheScreen();
  });

  it("has neither a hint nor visible error text when errorMessage is absent", () => {
    render(<Input label="Email" />);

    expect(
      screen.getByLabelText("Email").props.accessibilityHint
    ).toBeUndefined();
    expect(screen.queryByTestId("root-error")).not.toBeOnTheScreen();
  });
});
