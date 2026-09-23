import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import "../test/jsdomShims";
import { Toast, Toaster, toast } from "./Toast";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

describe("Toast", () => {
  /*
   * The behavioural contract. A toast appears without being
   * asked for, so a live region is the only thing that tells a screen reader
   * user anything happened at all.
   */
  it("announces itself as a status", () => {
    render(<Toast title="Gebaar opgeslagen" />);
    expect(screen.getByRole("status").textContent).toContain(
      "Gebaar opgeslagen"
    );
  });

  /*
   * `alert` interrupts whatever is being read. That is right for a failure
   * and wrong for "opgeslagen", so the polite region is the default and the
   * rude one is the caller's to ask for — which works only because props are
   * spread last.
   */
  it("lets a caller escalate it to an alert", () => {
    render(<Toast role="alert" title="Opslaan mislukt" />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders its title and description", () => {
    render(<Toast description="Twaalf gebaren bijgewerkt." title="Klaar" />);
    expect(screen.getByText("Klaar")).toBeDefined();
    expect(screen.getByText("Twaalf gebaren bijgewerkt.")).toBeDefined();
  });

  it("renders no description when there is none", () => {
    render(<Toast title="Klaar" />);
    expect(screen.getByRole("status").querySelectorAll("p")).toHaveLength(1);
  });

  it("defaults to the info variant", () => {
    render(<Toast title="Klaar" />);
    const classes = classesOf(screen.getByRole("status"));
    expect(classes).toContain("bg-surface-raised");
    expect(classes).not.toContain("bg-danger");
  });

  it("applies the requested variant instead of the default", () => {
    render(<Toast title="Mislukt" variant="danger" />);
    const classes = classesOf(screen.getByRole("status"));
    expect(classes).toContain("bg-danger");
    expect(classes).toContain("text-danger-foreground");
    expect(classes).not.toContain("bg-surface-raised");
  });

  it("renders no dismiss button without an onDismiss", () => {
    render(<Toast title="Klaar" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("dismisses on its close button", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<Toast onDismiss={onDismiss} title="Klaar" />);

    await user.click(screen.getByRole("button", { name: "Sluiten" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("lets a caller rename the dismiss button", () => {
    render(
      <Toast
        dismissLabel="Close"
        onDismiss={() => {
          // nothing to do
        }}
        title="Klaar"
      />
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Sluiten" })).toBeNull();
  });

  it("hides the dismiss icon from assistive technology", () => {
    render(
      <Toast
        onDismiss={() => {
          // nothing to do
        }}
        title="Klaar"
      />
    );
    const icon = screen
      .getByRole("button", { name: "Sluiten" })
      .querySelector("svg");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("lets className override a variant class", () => {
    render(<Toast className="bg-red-500" title="Klaar" />);
    const classes = classesOf(screen.getByRole("status"));
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-surface-raised");
  });

  it("forwards a ref to the element", () => {
    const ref = createRef<HTMLDivElement>();
    render(<Toast ref={ref} title="Klaar" />);
    expect(ref.current).toBe(screen.getByRole("status"));
  });

  it("spreads arbitrary props onto the element", () => {
    render(<Toast data-testid="melding" title="Klaar" />);
    expect(screen.getByTestId("melding")).toBe(screen.getByRole("status"));
  });
});

describe("Toaster", () => {
  /*
   * `sonner` owns the queue; what is ours is that everything it renders is
   * painted from this design system. That is what these two assert — the
   * timers, the stacking and the swipe are the library's and are not
   * retested here.
   */
  it("paints a queued toast with our own token classes", async () => {
    render(<Toaster />);

    act(() => {
      toast("Gebaar opgeslagen");
    });

    const queued = await screen.findByText("Gebaar opgeslagen");
    const element = queued.closest("[data-sonner-toast]");
    expect(element).not.toBeNull();
    expect(classesOf(element as Element)).toContain("bg-surface-raised");
  });

  it("lets a caller's own classNames win over ours", async () => {
    render(<Toaster toastOptions={{ classNames: { toast: "bg-red-500" } }} />);

    act(() => {
      toast("Gebaar opgeslagen");
    });

    const queued = await screen.findByText("Gebaar opgeslagen");
    const element = queued.closest("[data-sonner-toast]");
    expect(classesOf(element as Element)).toContain("bg-red-500");
    expect(classesOf(element as Element)).not.toContain("bg-surface-raised");
  });
});
