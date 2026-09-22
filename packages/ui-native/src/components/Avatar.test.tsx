import { render, screen } from "@testing-library/react-native";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
  it("renders initials derived from a two-word name", () => {
    render(<Avatar name="Ada Lovelace" />);

    expect(screen.getByText("AL")).toBeOnTheScreen();
  });

  it("renders a single initial for a single-word name", () => {
    /**
     * The case that catches a `parts[1]` bug: a one-word name has no second
     * word, and reaching for it unguarded either throws or renders
     * "Aundefined" instead of a clean single letter.
     */
    render(<Avatar name="Ada" />);

    expect(screen.getByText("A")).toBeOnTheScreen();
  });

  it("renders an image instead of initials when a uri is given", () => {
    render(<Avatar name="Ada Lovelace" uri="https://example.com/ada.png" />);

    expect(screen.queryByText("AL")).not.toBeOnTheScreen();
  });
});
