import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderKit, t } from "../test/render";
import { Field } from "./field";
import { Input } from "./input";
import { SearchField } from "./search-field";
import { Textarea } from "./textarea";

describe("Field", () => {
  it("names its control by the label", async () => {
    await renderKit(
      <Field label="Display name">
        <Input testID="input" />
      </Field>
    );
    expect(screen.getByLabelText("Display name")).toBe(
      screen.getByTestId("input")
    );
  });

  it("announces the error and marks the control invalid", async () => {
    await renderKit(
      <Field error="Too long" label="Display name">
        <Input testID="input" />
      </Field>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Too long");
    const input = screen.getByTestId("input");
    expect(input.props.accessibilityHint).toContain("Too long");
  });

  it("describes the control with the hint", async () => {
    await renderKit(
      <Field hint="Shown on the video" label="Display name">
        <Input testID="input" />
      </Field>
    );
    expect(screen.getByTestId("input").props.accessibilityHint).toBe(
      "Shown on the video"
    );
  });

  it("shows the optional marker and the counter", async () => {
    await renderKit(
      <Field counter={{ count: 12, max: 35 }} label="Display name" optional>
        <Input />
      </Field>
    );
    expect(screen.getByText(t("kit.optional"))).toBeOnTheScreen();
    expect(
      screen.getByLabelText(t("a11y.characterCount", { count: 12, max: 35 }))
    ).toBeOnTheScreen();
  });
});

describe("Input", () => {
  it("reports text changes and is 44 pt tall", async () => {
    const onChangeText = jest.fn();
    await renderKit(
      <Input
        accessibilityLabel="Email"
        onChangeText={onChangeText}
        testID="input"
      />
    );
    await fireEvent.changeText(screen.getByTestId("input"), "a@b.be");
    expect(onChangeText).toHaveBeenCalledWith("a@b.be");
    expect(screen.getByTestId("input")).toHaveStyle({ minHeight: 44 });
  });

  it("is not editable while disabled", async () => {
    await renderKit(<Input disabled testID="input" />);
    expect(screen.getByTestId("input").props.editable).toBe(false);
  });
});

describe("Textarea", () => {
  it("is multiline", async () => {
    await renderKit(<Textarea testID="textarea" />);
    expect(screen.getByTestId("textarea").props.multiline).toBe(true);
  });
});

describe("SearchField", () => {
  it("is named common.search and has the kit placeholder", async () => {
    await renderKit(<SearchField testID="search" />);
    const input = screen.getByLabelText(t("common.search"));
    expect(input.props.placeholder).toBe(t("kit.searchPlaceholder"));
  });

  it("clears with the clear button", async () => {
    const onValueChange = jest.fn();
    const onClear = jest.fn();
    await renderKit(
      <SearchField
        defaultValue="hallo"
        onClear={onClear}
        onValueChange={onValueChange}
      />
    );
    await fireEvent.press(
      screen.getByRole("button", { name: t("a11y.clearSearch") })
    );
    expect(onValueChange).toHaveBeenCalledWith("");
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: t("a11y.clearSearch") })
    ).toBeNull();
  });

  it("reports typing", async () => {
    const onValueChange = jest.fn();
    await renderKit(<SearchField onValueChange={onValueChange} />);
    await fireEvent.changeText(
      screen.getByLabelText(t("common.search")),
      "dank"
    );
    expect(onValueChange).toHaveBeenCalledWith("dank");
  });
});
