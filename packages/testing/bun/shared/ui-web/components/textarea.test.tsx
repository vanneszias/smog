import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { createRef } from "react";
import { Textarea } from "../../../../../ui-web/src/components/textarea";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

describe("Textarea", () => {
  test("is a multi-line textbox with field styles", () => {
    const ref = createRef<HTMLTextAreaElement>();
    renderKit(<Textarea aria-label="Message" invalid ref={ref} />);
    const textarea = screen.getByRole("textbox", { name: "Message" });
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(classesOf(textarea)).toContain("border-input");
    expect(classesOf(textarea)).toContain("py-3");
    expect(ref.current).toBe(textarea as HTMLTextAreaElement);
  });
});
