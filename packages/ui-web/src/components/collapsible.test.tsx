import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderKit } from "../test/render";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible";

describe("Collapsible", () => {
  test("the trigger shows and hides the content", async () => {
    renderKit(
      <Collapsible>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsibleContent>More text</CollapsibleContent>
      </Collapsible>
    );
    expect(screen.queryByText("More text")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByText("More text")).toBeDefined();
  });
});
