import { describe, expect, mock, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classesOf, renderKit } from "../test/render";
import { Pagination, pageItems } from "./pagination";

const noop = (): void => undefined;

describe("pageItems", () => {
  test("shows all pages when few, ellipses when many", () => {
    expect(pageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageItems(1, 20)).toEqual([1, 2, 3, "…", 20]);
    expect(pageItems(10, 20)).toEqual([1, "…", 9, 10, 11, "…", 20]);
    expect(pageItems(20, 20)).toEqual([1, "…", 18, 19, 20]);
  });
});

describe("Pagination", () => {
  test("a labelled nav; the current page is marked; prev/next are labelled", async () => {
    const onPageChange = mock();
    renderKit(
      <Pagination onPageChange={onPageChange} page={3} pageCount={10} />
    );
    const nav = screen.getByRole("navigation", { name: "Pagination" });
    const current = within(nav).getByRole("button", {
      name: "Page 3, current page",
    });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(classesOf(current)).toContain("bg-primary");
    await userEvent.click(
      within(nav).getByRole("button", { name: "Next page" })
    );
    expect(onPageChange).toHaveBeenLastCalledWith(4);
    await userEvent.click(
      within(nav).getByRole("button", { name: "Go to page 4" })
    );
    expect(onPageChange).toHaveBeenLastCalledWith(4);
    expect(screen.getByText("Page 3 of 10")).toBeDefined();
  });

  test("prev is disabled on the first page", () => {
    renderKit(<Pagination onPageChange={noop} page={1} pageCount={2} />);
    expect(
      screen
        .getByRole("button", { name: "Previous page" })
        .hasAttribute("disabled")
    ).toBe(true);
  });
});
