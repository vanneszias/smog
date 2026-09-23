import { SPONSORSHIP_STATUSES } from "@smog/config";
import { render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { SPONSORSHIP_STATUS_LABELS, StatusBadge } from "./StatusBadge";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

describe("StatusBadge", () => {
  /*
   * The list comes from `@smog/config`, not from a copy of the seven strings:
   * a status added there and forgotten here fails this test rather than
   * shipping a badge that reads `pending_resubmission` at a sponsor.
   */
  it("has a label for every status the config publishes", () => {
    expect(Object.keys(SPONSORSHIP_STATUS_LABELS).sort()).toEqual(
      [...SPONSORSHIP_STATUSES].sort()
    );
  });

  /*
   * Each status gets its own render and its own `unmount`, and every query is
   * scoped to that render's container. Reaching into the DOM to delete the
   * badge between iterations instead — the obvious shortcut — makes React's
   * unmount throw `NotFoundError` from inside Testing Library's `afterEach`,
   * which aborts the cleanup for good and leaves every later test in the file
   * querying a body full of other tests' output.
   */
  it("gives each status a label that is not the raw value", () => {
    for (const status of SPONSORSHIP_STATUSES) {
      const { container, unmount } = render(<StatusBadge status={status} />);
      expect(
        within(container).getByText(SPONSORSHIP_STATUS_LABELS[status])
      ).toBeDefined();
      expect(container.textContent).not.toBe(status);
      unmount();
    }
  });

  it("gives the seven statuses seven distinct labels", () => {
    const labels = SPONSORSHIP_STATUSES.map(
      (status) => SPONSORSHIP_STATUS_LABELS[status]
    );
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("renders no underscore-separated enum value to a reader", () => {
    for (const status of SPONSORSHIP_STATUSES) {
      expect(SPONSORSHIP_STATUS_LABELS[status]).not.toContain("_");
    }
  });

  /*
   * The variant is the whole point of a status badge: three of these seven
   * mean "nothing is wrong", three mean "waiting" and two mean "over". A map
   * that paints them all the same colour passes every label test above.
   */
  it("paints a live sponsorship as a success", () => {
    render(<StatusBadge status="active" />);
    expect(classesOf(screen.getByText("Actief"))).toContain("bg-success");
  });

  it("paints every pending status as a warning", () => {
    for (const status of [
      "pending_payment",
      "pending_approval",
      "pending_resubmission",
    ] as const) {
      const { container, unmount } = render(<StatusBadge status={status} />);
      const badge = within(container).getByText(
        SPONSORSHIP_STATUS_LABELS[status]
      );
      expect(classesOf(badge)).toContain("bg-warning");
      unmount();
    }
  });

  it("paints a rejection as a danger", () => {
    render(<StatusBadge status="rejected" />);
    expect(classesOf(screen.getByText("Afgewezen"))).toContain("bg-danger");
  });

  it("paints a cancellation as a danger", () => {
    render(<StatusBadge status="cancelled" />);
    expect(classesOf(screen.getByText("Geannuleerd"))).toContain("bg-danger");
  });

  /*
   * An expired sponsorship ran its course; it is not a failure, and painting
   * it red tells a sponsor something went wrong when nothing did.
   */
  it("paints an expiry as neutral rather than as a failure", () => {
    render(<StatusBadge status="expired" />);
    const classes = classesOf(screen.getByText("Verlopen"));
    expect(classes).toContain("bg-surface");
    expect(classes).not.toContain("bg-danger");
  });

  it("does not paint every status the same", () => {
    const variants = new Set(
      SPONSORSHIP_STATUSES.map((status) => {
        const { container, unmount } = render(<StatusBadge status={status} />);
        const classes = classesOf(container.firstElementChild as Element).join(
          " "
        );
        unmount();
        return classes;
      })
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  /*
   * Production rows outlive this map: a status read from the database that
   * nobody added here must render something, not throw the page away.
   */
  it("does not throw on a status it has never heard of", () => {
    expect(() => {
      render(<StatusBadge status="verzonnen_status" />).unmount();
    }).not.toThrow();
  });

  it("falls back to the raw value for an unknown status", () => {
    render(<StatusBadge status="verzonnen_status" />);
    expect(screen.getByText("verzonnen_status")).toBeDefined();
  });

  it("paints an unknown status neutrally", () => {
    render(<StatusBadge status="verzonnen_status" />);
    const classes = classesOf(screen.getByText("verzonnen_status"));
    expect(classes).toContain("bg-surface");
    expect(classes).not.toContain("bg-success");
  });

  it("lets a caller override a label", () => {
    render(<StatusBadge labels={{ active: "Loopt" }} status="active" />);
    expect(screen.getByText("Loopt")).toBeDefined();
  });

  it("keeps the built-in labels a caller did not override", () => {
    render(<StatusBadge labels={{ expired: "Voorbij" }} status="active" />);
    expect(screen.getByText("Actief")).toBeDefined();
  });

  it("forwards its ref to the badge", () => {
    const ref = createRef<HTMLSpanElement>();
    const { container } = render(<StatusBadge ref={ref} status="active" />);
    expect(ref.current).toBe(container.firstElementChild);
  });

  it("lets className override the variant's colour", () => {
    render(<StatusBadge className="bg-red-500" status="active" />);
    const classes = classesOf(screen.getByText("Actief"));
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-success");
  });

  it("spreads unknown props onto the badge", () => {
    render(<StatusBadge data-testid="status" status="active" />);
    expect(screen.getByTestId("status").textContent).toBe("Actief");
  });
});
