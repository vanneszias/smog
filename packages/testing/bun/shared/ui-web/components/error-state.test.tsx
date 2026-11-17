import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorState } from "../../../../../ui-web/src/components/error-state";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

describe("ErrorState", () => {
  test("is an alert with the states.error copy and a retry button", async () => {
    const onRetry = mock();
    renderKit(<ErrorState onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("This won’t load right now");
    expect(alert.textContent).toContain(
      "Check your internet connection and try again."
    );
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

describe("ErrorState art", () => {
  test("the open palm in the brand green on a pale red disc (the colour is not the only signal)", () => {
    const { container } = renderKit(<ErrorState />);
    const disc = container.querySelector('[data-slot="error-disc"]');
    expect(classesOf(disc)).toContain("bg-danger-subtle");
    expect(classesOf(disc)).toContain("rounded-full");
    const hand = disc?.querySelector('[data-slot="error-illustration"]');
    expect(hand?.getAttribute("data-hand")).toBe("2");
    expect(classesOf(hand ?? null)).toContain("text-primary");
    expect(classesOf(hand ?? null)).not.toContain("text-danger-strong");
  });
});
