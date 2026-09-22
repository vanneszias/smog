import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Sheet } from "./Sheet";

describe("Sheet", () => {
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
