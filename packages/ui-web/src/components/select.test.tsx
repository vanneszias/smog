import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import { classesOf, renderKit } from "../test/render";
import { Select } from "./select";

const OPTIONS = [
  { label: "Nederlands", value: "nl" },
  { label: "English", value: "en" },
  { disabled: true, label: "Français", value: "fr" },
];

describe("Select", () => {
  test("is a combobox with the kit placeholder", () => {
    renderKit(<Select aria-label="Language" options={OPTIONS} />);
    const trigger = screen.getByRole("combobox", { name: "Language" });
    expect(trigger.textContent).toContain("Choose an option");
    const classes = classesOf(trigger);
    expect(classes).toContain("min-h-touch");
    expect(classes).toContain("focus-visible:ring-focus-ring");
  });

  test("shows the selected option and marks invalid", () => {
    renderKit(
      <Select aria-label="Language" invalid options={OPTIONS} value="en" />
    );
    const trigger = screen.getByRole("combobox", { name: "Language" });
    expect(trigger.textContent).toContain("English");
    expect(trigger.getAttribute("aria-invalid")).toBe("true");
  });

  test("open, it lists the options and reports a choice", () => {
    const onValueChange = mock();
    renderKit(
      <Select
        aria-label="Language"
        defaultOpen
        onValueChange={onValueChange}
        options={OPTIONS}
      />
    );
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Nederlands",
      "English",
      "Français",
    ]);
    expect(options[2]?.getAttribute("aria-disabled")).toBe("true");
  });
});
