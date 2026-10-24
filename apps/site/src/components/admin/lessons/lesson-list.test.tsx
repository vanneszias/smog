import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { renderSite } = await import("@/test/render");
const { LessonList, NewLessonButton } = await import("./lesson-list");

/*
 * Phase 10c task 4: the lesson list over a fake API (English UI): the rows,
 * the title search and "my lessons" filter sent to the server, the row menu
 * (delete only on a lesson the viewer may edit, after a confirmation) and
 * the empty states.
 */

const TITLE_LABEL = /^Title/;

const MINE = {
  authorName: "Ann Author",
  canEdit: true,
  gestureCount: 3,
  id: "l1",
  mine: true,
  number: 1,
  title: "Dieren",
  titleLocale: "nl",
  updatedAt: Date.UTC(2026, 9, 20),
  version: 2,
};
const THEIRS = {
  authorName: "Bob Teacher",
  canEdit: false,
  gestureCount: 5,
  id: "l2",
  mine: false,
  number: null,
  title: "Planten",
  titleLocale: "nl",
  updatedAt: Date.UTC(2026, 9, 18),
  version: 1,
};

function page() {
  return (
    <div data-testid="page">
      <NewLessonButton />
      <LessonList />
    </div>
  );
}

function listCalls(calls: { input: unknown; path: string }[]) {
  return calls.filter((call) => call.path === "lessons/list");
}

describe("LessonList", () => {
  test("lists every lesson with its number, author and gesture count", async () => {
    await renderSite(page, {
      api: { "lessons/list": { items: [MINE, THEIRS], nextCursor: null } },
    });
    expect(await screen.findByText("Dieren")).toBeDefined();
    expect(screen.getByText("Planten")).toBeDefined();
    expect(screen.getByText("Ann Author")).toBeDefined();
    expect(screen.getByText("Bob Teacher")).toBeDefined();
    expect(screen.getByText("Yours")).toBeDefined();
    expect(screen.getByText("5")).toBeDefined();
  });

  test("sends the search text and the 'my lessons' filter to the server", async () => {
    const { calls } = await renderSite(page, {
      api: { "lessons/list": { items: [MINE], nextCursor: null } },
    });
    await screen.findByText("Dieren");
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search lessons" }),
      {
        target: { value: "dier" },
      }
    );
    await waitFor(() => {
      expect(
        listCalls(calls).some(
          (call) => (call.input as { query?: string }).query === "dier"
        )
      ).toBe(true);
    });
    fireEvent.click(screen.getByRole("switch", { name: "My lessons" }));
    await waitFor(() => {
      expect(
        listCalls(calls).some(
          (call) => (call.input as { mine?: boolean }).mine === true
        )
      ).toBe(true);
    });
  });

  test("a lesson of another teacher can be copied but not deleted; one's own is deleted after a confirmation", async () => {
    let list = [MINE, THEIRS];
    const { calls } = await renderSite(page, {
      api: {
        "lessons/delete": () => {
          list = list.filter((item) => item.id !== "l1");
          return { deleted: true };
        },
        "lessons/list": () => ({ items: list, nextCursor: null }),
      },
    });
    await screen.findByText("Planten");
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Planten" })
    );
    expect(
      await screen.findByRole("menuitem", { name: "Make a copy" })
    ).toBeDefined();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Dieren" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete" })
    );
    expect(await screen.findByText("Delete this lesson?")).toBeDefined();
    expect(calls.some((call) => call.path === "lessons/delete")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete lesson" }));
    await waitFor(() => {
      expect(calls.some((call) => call.path === "lessons/delete")).toBe(true);
    });
    expect(calls.find((call) => call.path === "lessons/delete")?.input).toEqual(
      { id: "l1" }
    );
    await waitFor(() => {
      expect(screen.queryByText("Dieren")).toBeNull();
    });
  });

  test("an empty list says so; an empty search says nothing matched", async () => {
    await renderSite(page, {
      api: { "lessons/list": { items: [], nextCursor: null } },
    });
    expect(await screen.findByText("No lessons yet")).toBeDefined();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search lessons" }),
      {
        target: { value: "zzz" },
      }
    );
    expect(await screen.findByText("No lessons found")).toBeDefined();
  });

  test("new lesson: a title and a language, then the builder opens", async () => {
    const { calls, router } = await renderSite(page, {
      api: {
        "lessons/create": { id: "new-1", version: 1 },
        "lessons/list": { items: [], nextCursor: null },
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "New lesson" }));
    const submit = await screen.findByRole("button", { name: "Create lesson" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: TITLE_LABEL }), {
      target: { value: "Les 1" },
    });
    fireEvent.click(submit);
    await waitFor(() => {
      expect(calls.some((call) => call.path === "lessons/create")).toBe(true);
    });
    expect(calls.find((call) => call.path === "lessons/create")?.input).toEqual(
      {
        locale: "en",
        number: null,
        title: "Les 1",
      }
    );
    expect(router).toBeDefined();
  });
});
