import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { selectionAsync } from "expo-haptics";
import { renderKit, t } from "../test/render";
import { Checkbox } from "./checkbox";
import { Field } from "./field";
import { RadioGroup } from "./radio-group";
import { Select } from "./select";
import { Switch } from "./switch";

const OPTIONS = [
  { label: "Dutch", value: "nl" },
  { label: "English", value: "en" },
  { disabled: true, label: "French", value: "fr" },
] as const;

describe("Checkbox", () => {
  it("is a checkbox named by its label that toggles", async () => {
    const onCheckedChange = jest.fn();
    await renderKit(
      <Checkbox
        checked={false}
        label="Remember me"
        onCheckedChange={onCheckedChange}
      />
    );
    const box = screen.getByRole("checkbox", { name: "Remember me" });
    expect(box).not.toBeChecked();
    await fireEvent.press(box);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("is uncontrolled with defaultChecked", async () => {
    await renderKit(<Checkbox defaultChecked label="Remember me" />);
    const box = screen.getByRole("checkbox", { name: "Remember me" });
    expect(box).toBeChecked();
    await fireEvent.press(box);
    expect(box).not.toBeChecked();
  });

  it("shows the indeterminate state as mixed", async () => {
    await renderKit(<Checkbox checked="indeterminate" label="All" />);
    expect(
      screen.getByRole("checkbox", { name: "All" })
    ).toBePartiallyChecked();
  });

  it("has a 44 pt row and does not toggle while disabled", async () => {
    const onCheckedChange = jest.fn();
    await renderKit(
      <Checkbox
        disabled
        label="Remember me"
        onCheckedChange={onCheckedChange}
        testID="box"
      />
    );
    const box = screen.getByRole("checkbox", { name: "Remember me" });
    expect(box).toHaveStyle({ minHeight: 44 });
    expect(box).toBeDisabled();
    await fireEvent.press(box);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});

describe("Switch", () => {
  it("is a switch named by its label that toggles with a haptic", async () => {
    const onCheckedChange = jest.fn();
    await renderKit(
      <Switch
        checked={false}
        label="Dark mode"
        onCheckedChange={onCheckedChange}
      />
    );
    const toggle = screen.getByRole("switch", { name: "Dark mode" });
    expect(toggle).not.toBeChecked();
    await fireEvent.press(toggle);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(selectionAsync).toHaveBeenCalledTimes(1);
  });

  it("does not toggle while disabled", async () => {
    const onCheckedChange = jest.fn();
    await renderKit(
      <Switch disabled label="Dark mode" onCheckedChange={onCheckedChange} />
    );
    const toggle = screen.getByRole("switch", { name: "Dark mode" });
    expect(toggle).toBeDisabled();
    await fireEvent.press(toggle);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});

describe("RadioGroup", () => {
  it("is a radiogroup of radios; pressing one selects it", async () => {
    const onValueChange = jest.fn();
    await renderKit(
      <RadioGroup
        aria-label="Language"
        defaultValue="nl"
        onValueChange={onValueChange}
        options={OPTIONS}
      />
    );
    expect(screen.getByLabelText("Language").props.accessibilityRole).toBe(
      "radiogroup"
    );
    expect(screen.getByRole("radio", { name: "Dutch" })).toBeChecked();
    await fireEvent.press(screen.getByRole("radio", { name: "English" }));
    expect(onValueChange).toHaveBeenCalledWith("en");
    expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
  });

  it("skips disabled options", async () => {
    const onValueChange = jest.fn();
    await renderKit(
      <RadioGroup
        aria-label="Language"
        onValueChange={onValueChange}
        options={OPTIONS}
      />
    );
    const french = screen.getByRole("radio", { name: "French" });
    expect(french).toBeDisabled();
    await fireEvent.press(french);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("is named by its Field label", async () => {
    await renderKit(
      <Field label="Language">
        <RadioGroup options={OPTIONS} />
      </Field>
    );
    expect(screen.getByLabelText("Language").props.accessibilityRole).toBe(
      "radiogroup"
    );
  });
});

describe("Select", () => {
  it("shows the placeholder and opens a picker sheet", async () => {
    const onValueChange = jest.fn();
    await renderKit(
      <Field label="Language">
        <Select onValueChange={onValueChange} options={OPTIONS} />
      </Field>
    );
    const trigger = screen.getByRole("combobox", { name: "Language" });
    expect(trigger).toHaveTextContent(t("kit.selectPlaceholder"));
    expect(trigger).toBeCollapsed();
    expect(screen.queryByRole("radio")).toBeNull();

    await fireEvent.press(trigger);
    await fireEvent.press(screen.getByRole("radio", { name: "English" }));
    expect(onValueChange).toHaveBeenCalledWith("en");
    expect(screen.queryByRole("radio")).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Language" })
    ).toHaveTextContent("English");
  });

  it("marks the selected option", async () => {
    await renderKit(
      <Select aria-label="Language" defaultOpen options={OPTIONS} value="nl" />
    );
    expect(screen.getByRole("radio", { name: "Dutch" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "French" })).toBeDisabled();
  });

  it("does not open while disabled", async () => {
    await renderKit(
      <Select aria-label="Language" disabled options={OPTIONS} />
    );
    const trigger = screen.getByRole("combobox", { name: "Language" });
    expect(trigger).toBeDisabled();
    await fireEvent.press(trigger);
    expect(screen.queryByRole("radio")).toBeNull();
  });
});
