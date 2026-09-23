import { fireEvent, render, screen } from "@testing-library/react-native";
import { Switch } from "./Switch";

describe("Switch", () => {
  it("reflects its value", () => {
    const off = render(
      <Switch label="On" onValueChange={() => undefined} value={false} />
    );
    const on = render(
      <Switch label="On" onValueChange={() => undefined} value />
    );

    expect(off.getByTestId("root")).not.toBeChecked();
    expect(on.getByTestId("root")).toBeChecked();
  });

  it("calls onValueChange with the negation of value", () => {
    const onValueChange = jest.fn();
    render(<Switch label="On" onValueChange={onValueChange} value={false} />);

    fireEvent(screen.getByTestId("root"), "valueChange", true);

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it("does not call onValueChange while disabled", () => {
    const onValueChange = jest.fn();
    render(
      <Switch disabled label="On" onValueChange={onValueChange} value={false} />
    );

    fireEvent(screen.getByTestId("root"), "valueChange", true);

    expect(onValueChange).not.toHaveBeenCalled();
  });
});
