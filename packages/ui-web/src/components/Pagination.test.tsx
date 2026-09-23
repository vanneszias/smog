import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

describe("Pagination", () => {
  it("renders a navigation landmark named in Dutch", () => {
    render(<Pagination page={1} pageCount={3} />);
    expect(
      screen.getByRole("navigation", { name: "Paginering" })
    ).toBeDefined();
  });

  it("lets a caller rename the landmark", () => {
    render(<Pagination label="Pages" page={1} pageCount={3} />);
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeDefined();
    expect(screen.queryByRole("navigation", { name: "Paginering" })).toBeNull();
  });

  /* The behavioural contract, both ends of it. */
  it("disables previous on the first page", () => {
    render(<Pagination page={1} pageCount={3} />);
    expect(screen.getByRole("button", { name: "Vorige" })).toHaveProperty(
      "disabled",
      true
    );
    expect(screen.getByRole("button", { name: "Volgende" })).toHaveProperty(
      "disabled",
      false
    );
  });

  it("disables next on the last page", () => {
    render(<Pagination page={3} pageCount={3} />);
    expect(screen.getByRole("button", { name: "Volgende" })).toHaveProperty(
      "disabled",
      true
    );
    expect(screen.getByRole("button", { name: "Vorige" })).toHaveProperty(
      "disabled",
      false
    );
  });

  it("enables both in the middle", () => {
    render(<Pagination page={2} pageCount={3} />);
    expect(screen.getByRole("button", { name: "Vorige" })).toHaveProperty(
      "disabled",
      false
    );
    expect(screen.getByRole("button", { name: "Volgende" })).toHaveProperty(
      "disabled",
      false
    );
  });

  it("disables both when there is only one page", () => {
    render(<Pagination page={1} pageCount={1} />);
    expect(screen.getByRole("button", { name: "Vorige" })).toHaveProperty(
      "disabled",
      true
    );
    expect(screen.getByRole("button", { name: "Volgende" })).toHaveProperty(
      "disabled",
      true
    );
  });

  it("reports the next page", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination onPageChange={onPageChange} page={2} pageCount={3} />);

    await user.click(screen.getByRole("button", { name: "Volgende" }));

    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("reports the previous page", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination onPageChange={onPageChange} page={2} pageCount={3} />);

    await user.click(screen.getByRole("button", { name: "Vorige" }));

    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  /*
   * A disabled button that still fires is the bug this contract is about: the
   * page index runs off the end and the list comes back empty.
   */
  it("reports nothing from the disabled previous button", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination onPageChange={onPageChange} page={1} pageCount={3} />);

    await user.click(screen.getByRole("button", { name: "Vorige" }));

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("reports nothing from the disabled next button", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination onPageChange={onPageChange} page={3} pageCount={3} />);

    await user.click(screen.getByRole("button", { name: "Volgende" }));

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("announces where the reader is", () => {
    render(<Pagination page={2} pageCount={5} />);
    const status = screen.getByText("Pagina 2 van 5");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });

  it("lets a caller format the status for another language", () => {
    render(
      <Pagination
        formatStatus={(page, pageCount) => `Page ${page} of ${pageCount}`}
        page={2}
        pageCount={5}
      />
    );
    expect(screen.getByText("Page 2 of 5")).toBeDefined();
    expect(screen.queryByText("Pagina 2 van 5")).toBeNull();
  });

  it("lets a caller rename the two buttons", () => {
    render(
      <Pagination
        nextLabel="Next"
        page={2}
        pageCount={5}
        previousLabel="Previous"
      />
    );
    expect(screen.getByRole("button", { name: "Previous" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Next" })).toBeDefined();
  });

  it("hides its arrows from assistive technology", () => {
    render(<Pagination page={2} pageCount={5} />);
    for (const name of ["Vorige", "Volgende"]) {
      const icon = screen.getByRole("button", { name }).querySelector("svg");
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("lets className override a base class", () => {
    render(<Pagination className="justify-start" page={1} pageCount={3} />);
    const classes = classesOf(screen.getByRole("navigation"));
    expect(classes).toContain("justify-start");
    expect(classes).not.toContain("justify-between");
  });

  it("forwards a ref to the navigation element", () => {
    const ref = createRef<HTMLElement>();
    render(<Pagination page={1} pageCount={3} ref={ref} />);
    expect(ref.current).toBe(screen.getByRole("navigation"));
  });

  it("spreads arbitrary props onto the element", () => {
    render(<Pagination data-testid="paginering" page={1} pageCount={3} />);
    expect(screen.getByTestId("paginering")).toBe(
      screen.getByRole("navigation")
    );
  });
});
