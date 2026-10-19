import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classesOf, renderKit } from "../test/render";
import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  test("is an alert with the states.error copy and a retry button", async () => {
    const onRetry = mock();
    renderKit(<ErrorState onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Something went wrong");
    expect(alert.textContent).toContain("We couldn't load this.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("without onRetry there is no button", () => {
    renderKit(<ErrorState title="Oops" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("heading", { name: "Oops" })).toBeDefined();
  });

  test("is the page's h1 at level 1, sized as a screen title", () => {
    renderKit(<ErrorState level={1} title="Oops" />);
    const heading = screen.getByRole("heading", { level: 1, name: "Oops" });
    expect(classesOf(heading)).toContain("text-title-1");
  });
});
