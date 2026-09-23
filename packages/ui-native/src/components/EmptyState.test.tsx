import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders its title", () => {
    render(<EmptyState title="Nothing here" />);

    expect(screen.getByText("Nothing here")).toBeOnTheScreen();
  });

  it("marks the title as a heading to assistive technology", () => {
    /**
     * `role="header"` is the one thing a screen reader can jump between —
     * without it an empty state that replaces a list's contents reads as an
     * anonymous block of text rather than the heading for what changed.
     */
    render(<EmptyState title="Nothing here" />);

    expect(
      screen.getByRole("header", { name: "Nothing here" })
    ).toBeOnTheScreen();
  });

  it("renders an optional description and action", () => {
    render(
      <EmptyState
        action={<Text>Add one</Text>}
        description="Try a different filter"
        title="Nothing here"
      />
    );

    expect(screen.getByText("Try a different filter")).toBeOnTheScreen();
    expect(screen.getByText("Add one")).toBeOnTheScreen();
  });
});
