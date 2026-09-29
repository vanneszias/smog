import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { classesOf, renderKit } from "../test/render";
import { Field } from "./field";
import { Input } from "./input";
import { Select } from "./select";
import { Textarea } from "./textarea";

describe("Field", () => {
  test("labels the control and describes it with the hint", () => {
    renderKit(
      <Field hint="We never share it." label="Email">
        <Input type="email" />
      </Field>
    );
    const input = screen.getByRole("textbox", { name: "Email" });
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe(
      "We never share it."
    );
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  test("an error marks the control invalid and is announced", () => {
    renderKit(
      <Field error="Enter a valid email address." label="Email" required>
        <Input />
      </Field>
    );
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.hasAttribute("required")).toBe(true);
    const error = screen.getByText("Enter a valid email address.");
    expect(input.getAttribute("aria-describedby")).toContain(error.id);
    expect(classesOf(error)).toContain("text-danger-strong");
  });

  test("optional fields say so in the label", () => {
    renderKit(
      <Field label="Company" optional>
        <Input />
      </Field>
    );
    expect(screen.getByText("Company").parentElement?.textContent).toContain(
      "Optional"
    );
  });

  test("the counter shows count/max and a spoken version", () => {
    renderKit(
      <Field counter={{ count: 12, max: 35 }} label="Display name">
        <Textarea />
      </Field>
    );
    expect(screen.getByText("12/35")).toBeDefined();
    expect(screen.getByText("12 of 35 characters used")).toBeDefined();
    expect(screen.getByRole("textbox", { name: "Display name" })).toBeDefined();
  });

  test("labels a Select trigger", () => {
    renderKit(
      <Field label="Language">
        <Select options={[{ label: "Nederlands", value: "nl" }]} />
      </Field>
    );
    expect(screen.getByRole("combobox", { name: "Language" })).toBeDefined();
  });
});
