import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RadioGroup } from "../../../../../ui-web/src/components/radio-group";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

const OPTIONS = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { description: "Easier on the eyes", label: "Dark", value: "dark" },
];

describe("RadioGroup", () => {
  test("is a labelled radiogroup of radios", async () => {
    const onValueChange = mock();
    renderKit(
      <RadioGroup
        aria-label="Theme"
        defaultValue="system"
        onValueChange={onValueChange}
        options={OPTIONS}
      />
    );
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeDefined();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios[0]?.getAttribute("aria-checked")).toBe("true");
    expect(classesOf(radios[0] ?? null)).toContain("after:size-touch");
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(onValueChange).toHaveBeenCalledWith("dark");
  });
});
