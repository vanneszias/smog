import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import "../test/jsdomShims";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./Tooltip";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

function renderTooltip(props: Partial<{ className: string }> = {}) {
  return render(
    <>
      <button type="button">Eerst</button>
      <Tooltip>
        <TooltipTrigger>Verwijderen</TooltipTrigger>
        <TooltipContent {...props}>Verwijdert dit gebaar</TooltipContent>
      </Tooltip>
    </>
  );
}

describe("Tooltip", () => {
  /*
   * Ours, not Radix's: `Tooltip.Root` throws without a `Tooltip.Provider`
   * above it, so a one-off tooltip is a runtime error with the bare
   * primitive. This root brings its own provider, which is why a single
   * tooltip can be dropped anywhere.
   */
  it("renders without an app-level provider above it", () => {
    expect(() => renderTooltip()).not.toThrow();
    expect(screen.getByRole("button", { name: "Verwijderen" })).toBeDefined();
  });

  it("renders nothing but its trigger while closed", () => {
    renderTooltip();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  /*
   * The behavioural contract from the plan. A tooltip reachable only by hover
   * does not exist for a keyboard user, and hover is the only interaction
   * most tooltip tests exercise.
   */
  it("shows on keyboard focus, not only on hover", async () => {
    const user = userEvent.setup();
    renderTooltip();

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Eerst" })
    );

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Verwijderen" })
    );

    expect(await screen.findByRole("tooltip")).toBeDefined();
    expect(screen.getByRole("tooltip").textContent).toBe(
      "Verwijdert dit gebaar"
    );
  });

  it("hides again when focus leaves the trigger", async () => {
    const user = userEvent.setup();
    renderTooltip();

    await user.tab();
    await user.tab();
    expect(await screen.findByRole("tooltip")).toBeDefined();

    await user.tab();

    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).toBeNull();
    });
  });

  it("shows on hover as well", async () => {
    const user = userEvent.setup();
    renderTooltip();

    await user.hover(screen.getByRole("button", { name: "Verwijderen" }));

    expect(await screen.findByRole("tooltip")).toBeDefined();
  });

  it("closes on Escape while the trigger keeps focus", async () => {
    const user = userEvent.setup();
    renderTooltip();

    const trigger = screen.getByRole("button", { name: "Verwijderen" });
    trigger.focus();
    expect(await screen.findByRole("tooltip")).toBeDefined();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it("describes its trigger while open", async () => {
    renderTooltip();

    const trigger = screen.getByRole("button", { name: "Verwijderen" });
    trigger.focus();
    const tooltip = await screen.findByRole("tooltip");

    expect(trigger.getAttribute("aria-describedby")).toBe(
      tooltip.getAttribute("id")
    );
  });

  it("renders its content outside the local container", async () => {
    const { container } = renderTooltip();

    screen.getByRole("button", { name: "Verwijderen" }).focus();
    await screen.findByRole("tooltip");

    const visible = screen.getByText("Verwijdert dit gebaar", {
      selector: "div",
    });
    expect(container.contains(visible)).toBe(false);
  });

  it("lets className override a base class on the content", async () => {
    renderTooltip({ className: "bg-red-500" });

    screen.getByRole("button", { name: "Verwijderen" }).focus();
    await screen.findByRole("tooltip");

    const classes = classesOf(
      screen.getByText("Verwijdert dit gebaar", { selector: "div" })
    );
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-foreground");
  });

  it("spreads arbitrary props onto the content", async () => {
    render(
      <Tooltip open>
        <TooltipTrigger>Verwijderen</TooltipTrigger>
        <TooltipContent data-testid="uitleg">
          Verwijdert dit gebaar
        </TooltipContent>
      </Tooltip>
    );

    expect(await screen.findByTestId("uitleg")).toBeDefined();
  });

  it("forwards a ref to the content element", async () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Tooltip open>
        <TooltipTrigger>Verwijderen</TooltipTrigger>
        <TooltipContent data-testid="uitleg" ref={ref}>
          Verwijdert dit gebaar
        </TooltipContent>
      </Tooltip>
    );

    await screen.findByTestId("uitleg");
    expect(ref.current).toBe(screen.getByTestId("uitleg"));
  });

  it("still works inside an app-level provider", async () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Verwijderen</TooltipTrigger>
          <TooltipContent>Verwijdert dit gebaar</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    screen.getByRole("button", { name: "Verwijderen" }).focus();

    expect(await screen.findByRole("tooltip")).toBeDefined();
  });
});
