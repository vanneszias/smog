import { describe, expect, test } from "bun:test";
import type { AdminCategory } from "@smog/admin/schema";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderSite, rpcError } from "@/test/render";
import { CategoryList } from "./category-list";

/*
 * `/admin/categories` (A-22) over a fake API: the published and hidden
 * sections with their counts, "move down" → one `reorder` with every id,
 * delete only for an unused category, create, and a duplicate rename.
 */

function category(
  id: string,
  name: string,
  overrides: Partial<AdminCategory> = {}
): AdminCategory {
  return {
    gestureCount: 3,
    id,
    name,
    publishedAt: 1,
    publishedGestureCount: 2,
    slug: name.toLowerCase(),
    sortOrder: 0,
    updatedAt: 10,
    ...overrides,
  };
}

const LIST = [
  category("c1", "Begroeten", { sortOrder: 0 }),
  category("c2", "Familie", { sortOrder: 1 }),
  category("c3", "Oud", {
    gestureCount: 0,
    publishedAt: null,
    publishedGestureCount: 0,
    sortOrder: 2,
  }),
];

function page() {
  return (
    <div data-testid="page">
      <CategoryList />
    </div>
  );
}

async function openMenu(name: string): Promise<HTMLElement> {
  await userEvent.click(
    await screen.findByRole("button", { name: `Actions for ${name}` })
  );
  return screen.findByRole("menu");
}

describe("CategoryList", () => {
  test("shows the published and hidden sections with gesture counts", async () => {
    await renderSite(page, { api: { "admin/categories/list": LIST } });
    const published = await screen.findByRole("region", {
      name: "Published (2)",
    });
    expect(within(published).getByText("Begroeten")).toBeDefined();
    expect(
      within(published).getAllByText("3 gestures · 2 published")
    ).toHaveLength(2);
    const hidden = screen.getByRole("region", { name: "Hidden (1)" });
    expect(within(hidden).getByText("Oud")).toBeDefined();
    expect(within(hidden).getByText("0 gestures")).toBeDefined();
  });

  test("move down saves the whole new order in one reorder", async () => {
    const { calls } = await renderSite(page, {
      api: {
        "admin/categories/list": LIST,
        "admin/categories/reorder": LIST,
      },
    });
    const menu = await openMenu("Begroeten");
    expect(
      within(menu)
        .getByRole("menuitem", { name: "Move up" })
        .getAttribute("aria-disabled")
    ).toBe("true");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Move down" })
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.path === "admin/categories/reorder")?.input
      ).toEqual({ ids: ["c2", "c1", "c3"] })
    );
  });

  test("offers delete only for an unused category", async () => {
    const { calls } = await renderSite(page, {
      api: {
        "admin/categories/delete": { id: "c3" },
        "admin/categories/list": LIST,
      },
    });
    const used = await openMenu("Begroeten");
    expect(
      within(used)
        .getByRole("menuitem", { name: "In use: unpublish instead" })
        .getAttribute("aria-disabled")
    ).toBe("true");
    await userEvent.keyboard("{Escape}");
    const unused = await openMenu("Oud");
    await userEvent.click(
      within(unused).getByRole("menuitem", { name: "Delete" })
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete Oud?",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" })
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.path === "admin/categories/delete")?.input
      ).toEqual({ id: "c3" })
    );
  });

  test("creates a category, and shows a duplicate name on rename", async () => {
    const { calls } = await renderSite(page, {
      api: {
        "admin/categories/create": category("c4", "Eten"),
        "admin/categories/list": LIST,
        "admin/categories/update": () =>
          rpcError("CONFLICT", 409, { reason: "duplicateName" }),
      },
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "New category" })
    );
    const create = await screen.findByRole("dialog", { name: "New category" });
    fireEvent.change(within(create).getByRole("textbox", { name: "Name" }), {
      target: { value: " Eten " },
    });
    await userEvent.click(
      within(create).getByRole("button", { name: "Create" })
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.path === "admin/categories/create")?.input
      ).toEqual({ name: "Eten", published: true })
    );

    const menu = await openMenu("Familie");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Rename" })
    );
    const rename = await screen.findByRole("dialog", {
      name: "Rename Familie",
    });
    fireEvent.change(within(rename).getByRole("textbox", { name: "Name" }), {
      target: { value: "Begroeten" },
    });
    await userEvent.click(within(rename).getByRole("button", { name: "Save" }));
    expect(
      await within(rename).findByText(
        "A category with this name already exists."
      )
    ).toBeDefined();
    expect(
      calls.find((call) => call.path === "admin/categories/update")?.input
    ).toEqual({ expectedUpdatedAt: 10, id: "c2", name: "Begroeten" });
  });
});
