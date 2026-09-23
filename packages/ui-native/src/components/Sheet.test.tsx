import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Sheet } from "./Sheet";

describe("Sheet", () => {
  /**
   * This pair's real coverage sits entirely on the "open" case below, not
   * this one: `react-native`'s own jest preset swaps `Modal` for a mock
   * (`react-native/jest/mocks/Modal.js`) whose `render()` already returns
   * `null` when `visible === false`, so this assertion passes whether or not
   * `Sheet` has its own `if (!open) return null` guard — the test
   * environment carries it either way. It stays in the suite as the
   * half of the pair a dead, always-null `Sheet` would still satisfy; it is
   * "renders its contents while open" that a component with no real
   * open/closed branch cannot pass, and that is the one actually asserting
   * this component's behaviour.
   */
  it("renders nothing while closed", () => {
    render(
      <Sheet onClose={() => undefined} open={false} title="Filters">
        <Text>contents</Text>
      </Sheet>
    );

    expect(screen.queryByText("contents")).toBeNull();
  });

  it("renders its contents while open", () => {
    render(
      <Sheet onClose={() => undefined} open title="Filters">
        <Text>contents</Text>
      </Sheet>
    );

    expect(screen.getByText("contents")).toBeOnTheScreen();
  });

  it("names itself to assistive technology", () => {
    render(
      <Sheet onClose={() => undefined} open title="Filters">
        <Text>contents</Text>
      </Sheet>
    );

    expect(screen.getByLabelText("Filters")).toBeOnTheScreen();
  });

  it("calls onClose when the close control is pressed", () => {
    const onClose = jest.fn();
    render(
      <Sheet onClose={onClose} open title="Filters">
        <Text>contents</Text>
      </Sheet>
    );

    fireEvent.press(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
