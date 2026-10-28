import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../../../../ui-web/src/components/accordion";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

describe("Accordion", () => {
  test("a trigger toggles its panel and reports aria-expanded", async () => {
    renderKit(
      <Accordion collapsible type="single">
        <AccordionItem value="a">
          <AccordionTrigger>Where are my favorites?</AccordionTrigger>
          <AccordionContent>In My space.</AccordionContent>
        </AccordionItem>
      </Accordion>
    );
    const trigger = screen.getByRole("button", {
      name: "Where are my favorites?",
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(classesOf(trigger)).toContain("min-h-touch");
    expect(classesOf(trigger)).toContain("focus-visible:ring-ring");
    await userEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const panel = screen.getByRole("region", {
      name: "Where are my favorites?",
    });
    expect(panel.textContent).toBe("In My space.");
    expect(classesOf(panel)).toContain("motion-reduce:animate-none");
  });
});
