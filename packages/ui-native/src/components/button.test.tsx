import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { NotificationFeedbackType, notificationAsync } from "expo-haptics";
import Plus from "lucide-react-native/icons/plus";
import { Text } from "react-native";
import { renderKit, t } from "../test/render";
import { Button } from "./button";
import { IconButton } from "./icon-button";

describe("Button", () => {
  it("is a button named by its children and fires onPress", async () => {
    const onPress = jest.fn();
    await renderKit(<Button onPress={onPress}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("is 44 pt tall at md", async () => {
    await renderKit(<Button testID="button">Save</Button>);
    expect(screen.getByTestId("button")).toHaveStyle({ minHeight: 44 });
  });

  it("keeps a 44 pt target at sm through hitSlop", async () => {
    await renderKit(
      <Button size="sm" testID="button">
        Save
      </Button>
    );
    const button = screen.getByTestId("button");
    expect(button).toHaveStyle({ minHeight: 32 });
    expect(button.props.hitSlop).toBe(6);
  });

  it("does not fire while disabled", async () => {
    const onPress = jest.fn();
    await renderKit(
      <Button disabled onPress={onPress}>
        Save
      </Button>
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("is busy and disabled while loading", async () => {
    await renderKit(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
  });

  it("plays the warning haptic when a danger action is pressed", async () => {
    const onPress = jest.fn();
    await renderKit(
      <Button onPress={onPress} variant="danger">
        Delete
      </Button>
    );
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(notificationAsync).toHaveBeenCalledWith(
      NotificationFeedbackType.Warning
    );
  });

  it("renders a leading icon without naming the button after it", async () => {
    await renderKit(<Button icon={<Plus testID="icon" />}>Add</Button>);
    expect(screen.getByRole("button", { name: "Add" })).toBeOnTheScreen();
    expect(
      screen.getByTestId("icon", { includeHiddenElements: true })
    ).toBeTruthy();
  });
});

describe("IconButton", () => {
  it("is named by its label and fires onPress", async () => {
    const onPress = jest.fn();
    await renderKit(
      <IconButton
        icon={<Text>x</Text>}
        label={t("a11y.close")}
        onPress={onPress}
      />
    );
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("is 44 × 44 pt at md and keeps a 44 pt target at sm", async () => {
    await renderKit(
      <>
        <IconButton icon={<Text>x</Text>} label="Close" testID="md" />
        <IconButton icon={<Text>x</Text>} label="Close" size="sm" testID="sm" />
      </>
    );
    expect(screen.getByTestId("md")).toHaveStyle({ height: 44, width: 44 });
    expect(screen.getByTestId("sm").props.hitSlop).toBe(6);
  });

  it("does not fire while disabled", async () => {
    const onPress = jest.fn();
    await renderKit(
      <IconButton
        disabled
        icon={<Text>x</Text>}
        label="Close"
        onPress={onPress}
      />
    );
    const button = screen.getByRole("button", { name: "Close" });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
