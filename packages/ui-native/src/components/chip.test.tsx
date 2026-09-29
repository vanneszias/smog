import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { selectionAsync } from "expo-haptics";
import { renderKit } from "../test/render";
import { Badge } from "./badge";
import { Chip } from "./chip";

describe("Chip", () => {
  it("is a plain button without `selected`", async () => {
    const onPress = jest.fn();
    await renderKit(<Chip onPress={onPress}>Greetings</Chip>);
    await fireEvent.press(screen.getByRole("button", { name: "Greetings" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("is a toggle with `selected`, reports the next state and ticks", async () => {
    const onSelectedChange = jest.fn();
    await renderKit(
      <Chip onSelectedChange={onSelectedChange} selected={false}>
        Greetings
      </Chip>
    );
    const chip = screen.getByRole("togglebutton", { name: "Greetings" });
    expect(chip.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(chip);
    expect(onSelectedChange).toHaveBeenCalledWith(true);
    expect(selectionAsync).toHaveBeenCalledTimes(1);
  });

  it("shows the selected state", async () => {
    await renderKit(<Chip selected>Greetings</Chip>);
    expect(
      screen.getByRole("togglebutton", { name: "Greetings" }).props
        .accessibilityState
    ).toMatchObject({ checked: true });
  });

  it("adds a remove button named after the chip", async () => {
    const onRemove = jest.fn();
    await renderKit(<Chip onRemove={onRemove}>Greetings</Chip>);
    await fireEvent.press(
      screen.getByRole("button", { name: "Remove Greetings" })
    );
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("keeps a 44 pt target at sm", async () => {
    await renderKit(
      <Chip size="sm" testID="chip">
        Greetings
      </Chip>
    );
    expect(screen.getByTestId("chip").props.hitSlop).toBe(6);
  });

  it("does not toggle while disabled", async () => {
    const onSelectedChange = jest.fn();
    await renderKit(
      <Chip disabled onSelectedChange={onSelectedChange} selected={false}>
        Greetings
      </Chip>
    );
    const chip = screen.getByRole("togglebutton", { name: "Greetings" });
    expect(chip).toBeDisabled();
    await fireEvent.press(chip);
    expect(onSelectedChange).not.toHaveBeenCalled();
  });
});

describe("Badge", () => {
  it("renders its text, not as a control", async () => {
    await renderKit(
      <Badge testID="badge" variant="success">
        Active
      </Badge>
    );
    expect(screen.getByText("Active")).toBeOnTheScreen();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
