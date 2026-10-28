import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Label } from "../../../../../ui-web/src/components/label";
import { renderKit } from "../../../../support/ui-web/render";

describe("Label", () => {
  test("names its control and focuses it on click", async () => {
    renderKit(
      <>
        <Label htmlFor="name">Name</Label>
        <input id="name" />
      </>
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    await userEvent.click(screen.getByText("Name"));
    expect(document.activeElement).toBe(input);
  });
});
