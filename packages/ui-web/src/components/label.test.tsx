import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderKit } from "../test/render";
import { Label } from "./label";

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
