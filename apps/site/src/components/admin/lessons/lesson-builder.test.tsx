import { describe, expect, test } from "bun:test";
import type { LessonDetail } from "@smog/lessons/schema";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

const { renderSite, rpcError } = await import("@/test/render");
const { LessonBuilder } = await import("./lesson-builder");

/*
 * Phase 10c task 4: the lesson builder over a fake API (English UI; English
 * is the active tab, Dutch the default language): the autosave and its
 * version lock, a conflict with another editor, the missing-title stop, the
 * sections, and the read-only view of another teacher's lesson.
 */

const ITEM_A = {
  hasDrawing: true,
  id: "g1",
  name: "Hallo",
  playbackId: "pb1",
  published: true,
  slug: "hallo",
};
const ITEM_B = {
  hasDrawing: false,
  id: "g2",
  name: "Dag",
  playbackId: "pb2",
  published: false,
  slug: "dag",
};

const LESSON: LessonDetail = {
  authorId: "u1",
  authorName: "Ann Author",
  canEdit: true,
  createdAt: 1000,
  id: "l1",
  number: 1,
  sections: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      items: [ITEM_B],
      titles: { nl: "Begroetingen" },
    },
  ],
  translations: { nl: { notes: "", title: "Les 1" } },
  ungrouped: [ITEM_A],
  updatedAt: 1000,
  version: 3,
};

const READINESS = {
  fallback: 0,
  items: [{ gestureId: "g1", state: "own" }],
  locale: "en",
  none: 0,
  own: 1,
  total: 1,
};

const DUTCH_TAB = /Nederlands/;
const TITLE = "Title";
const SAVED = "All changes saved";
const AUTOSAVE_WAIT = { timeout: 4000 };

function page(lesson: LessonDetail) {
  return () => (
    <div data-testid="page">
      <LessonBuilder lesson={lesson} />
    </div>
  );
}

function updates(calls: { input: unknown; path: string }[]): unknown[] {
  return calls
    .filter((call) => call.path === "lessons/update")
    .map((call) => call.input);
}

describe("LessonBuilder", () => {
  test("shows the lesson: the gestures with their marks, the section, the readiness bar", async () => {
    await renderSite(page(LESSON), {
      api: { "lessons/readiness": READINESS },
    });
    expect(await screen.findByText("Hallo")).toBeDefined();
    expect(screen.getByText("Dag")).toBeDefined();
    expect(screen.getByText("Unpublished")).toBeDefined();
    expect(screen.getByText("Drawing")).toBeDefined();
    expect(screen.getByText("2 gestures")).toBeDefined();
    // The section's English title is empty: the default language's is its placeholder.
    const section = screen.getByRole("textbox", { name: "Title of section 1" });
    expect((section as HTMLInputElement).value).toBe("");
    expect((section as HTMLInputElement).placeholder).toBe("Begroetingen");
    expect(
      await screen.findByText("1 of 1 gestures have teacher info in English.")
    ).toBeDefined();
    expect(await screen.findByText("Teacher info")).toBeDefined();
    expect(screen.getByTestId("lesson-save-status").textContent).toContain(
      SAVED
    );
  });

  test("autosaves a title after the pause with the version it read, then the next edit with the new one", async () => {
    let version = 3;
    const { calls } = await renderSite(page(LESSON), {
      api: {
        "lessons/readiness": READINESS,
        "lessons/update": () => {
          version += 1;
          return { unchanged: false, updatedAt: 2000, version };
        },
      },
    });
    const title = await screen.findByRole("textbox", { name: TITLE });
    fireEvent.change(title, { target: { value: "Lesson 1" } });
    await waitFor(() => {
      expect(updates(calls)).toHaveLength(1);
    }, AUTOSAVE_WAIT);
    expect(updates(calls)[0]).toMatchObject({
      expectedVersion: 3,
      id: "l1",
      number: 1,
      translations: {
        en: { notes: "", title: "Lesson 1" },
        nl: { notes: "", title: "Les 1" },
      },
      ungrouped: ["g1"],
    });
    await waitFor(() => {
      expect(screen.getByTestId("lesson-save-status").textContent).toContain(
        SAVED
      );
    }, AUTOSAVE_WAIT);
    fireEvent.change(title, { target: { value: "Lesson one" } });
    await waitFor(() => {
      expect(updates(calls)).toHaveLength(2);
    }, AUTOSAVE_WAIT);
    expect(updates(calls)[1]).toMatchObject({ expectedVersion: 4 });
  });

  test("a second edit while a save runs is sent right after it, with the version the first returned", async () => {
    let release: () => void = () => undefined;
    let version = 3;
    let count = 0;
    const { calls } = await renderSite(page(LESSON), {
      api: {
        "lessons/readiness": READINESS,
        "lessons/update": async () => {
          count += 1;
          if (count === 1) {
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
          version += 1;
          return { unchanged: false, updatedAt: 2000, version };
        },
      },
    });
    const title = await screen.findByRole("textbox", { name: TITLE });
    fireEvent.change(title, { target: { value: "One" } });
    await waitFor(() => {
      expect(updates(calls)).toHaveLength(1);
    }, AUTOSAVE_WAIT);
    fireEvent.change(title, { target: { value: "One two" } });
    // Nothing else is sent while the first save is in flight.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(updates(calls)).toHaveLength(1);
    release();
    await waitFor(() => {
      expect(updates(calls)).toHaveLength(2);
    }, AUTOSAVE_WAIT);
    expect(updates(calls)[1]).toMatchObject({
      expectedVersion: 4,
      translations: { en: { title: "One two" } },
    });
  });

  test("a lost save stops with the other editor's lesson: use theirs replaces the draft", async () => {
    const theirs: LessonDetail = {
      ...LESSON,
      translations: { nl: { notes: "", title: "Les van hen" } },
      version: 4,
    };
    const { calls } = await renderSite(page(LESSON), {
      api: {
        "lessons/readiness": READINESS,
        "lessons/update": rpcError("CONFLICT", 409, {
          current: theirs,
          reason: "stale",
        }),
      },
    });
    const title = await screen.findByRole("textbox", { name: TITLE });
    fireEvent.change(title, { target: { value: "Mine" } });
    expect(
      await screen.findByText(
        "This lesson was changed elsewhere",
        {},
        AUTOSAVE_WAIT
      )
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Use their version" }));
    expect(screen.queryByText("This lesson was changed elsewhere")).toBeNull();
    const dutch = screen.getByRole("tab", { name: DUTCH_TAB });
    fireEvent.mouseDown(dutch, { button: 0 });
    fireEvent.click(dutch);
    const panel = screen.getByRole("tabpanel", { name: DUTCH_TAB });
    expect(
      (within(panel).getByRole("textbox", { name: TITLE }) as HTMLInputElement)
        .value
    ).toBe("Les van hen");
    expect(updates(calls)).toHaveLength(1);
  });

  test("keep mine saves again over their version", async () => {
    const theirs: LessonDetail = { ...LESSON, version: 7 };
    let first = true;
    const { calls } = await renderSite(page(LESSON), {
      api: {
        "lessons/readiness": READINESS,
        "lessons/update": () => {
          if (first) {
            first = false;
            return rpcError("CONFLICT", 409, {
              current: theirs,
              reason: "stale",
            });
          }
          return { unchanged: false, updatedAt: 3000, version: 8 };
        },
      },
    });
    const title = await screen.findByRole("textbox", { name: TITLE });
    fireEvent.change(title, { target: { value: "Mine" } });
    await screen.findByText(
      "This lesson was changed elsewhere",
      {},
      AUTOSAVE_WAIT
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    await waitFor(() => {
      expect(updates(calls)).toHaveLength(2);
    }, AUTOSAVE_WAIT);
    expect(updates(calls)[1]).toMatchObject({
      expectedVersion: 7,
      translations: { en: { title: "Mine" } },
    });
  });

  test("nothing is sent while no language has a title", async () => {
    const { calls } = await renderSite(page(LESSON), {
      api: { "lessons/readiness": READINESS },
    });
    const dutch = await screen.findByRole("tab", { name: DUTCH_TAB });
    fireEvent.mouseDown(dutch, { button: 0 });
    fireEvent.click(dutch);
    const panel = screen.getByRole("tabpanel", { name: DUTCH_TAB });
    fireEvent.change(within(panel).getByRole("textbox", { name: TITLE }), {
      target: { value: "" },
    });
    expect(
      await screen.findByText(
        "Add a title in at least one language to save the lesson.",
        {},
        AUTOSAVE_WAIT
      )
    ).toBeDefined();
    await waitFor(() => {
      expect(
        screen.getByTestId("lesson-save-status").getAttribute("data-status")
      ).toBe("invalid");
    }, AUTOSAVE_WAIT);
    expect(updates(calls)).toHaveLength(0);
  });

  test("a section is added, titled and saved with the lesson", async () => {
    const { calls } = await renderSite(page({ ...LESSON, sections: [] }), {
      api: {
        "lessons/readiness": READINESS,
        "lessons/update": { unchanged: false, updatedAt: 2000, version: 4 },
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Add section" }));
    const input = await screen.findByRole("textbox", {
      name: "Title of section 1",
    });
    fireEvent.change(input, { target: { value: "Greetings" } });
    await waitFor(() => {
      expect(updates(calls)).toHaveLength(1);
    }, AUTOSAVE_WAIT);
    const [sent] = updates(calls) as {
      sections: { gestureIds: string[]; titles: Record<string, string> }[];
    }[];
    expect(sent?.sections).toHaveLength(1);
    expect(sent?.sections[0]).toMatchObject({
      gestureIds: [],
      titles: { en: "Greetings" },
    });
  });

  test("another teacher's lesson is read-only, with a button to copy it", async () => {
    const { calls } = await renderSite(page({ ...LESSON, canEdit: false }), {
      api: {
        "lessons/duplicate": { id: "copy", version: 1 },
        "lessons/readiness": READINESS,
      },
    });
    expect(
      await screen.findByText(
        "Ann Author edits this lesson. You can read it and make your own copy."
      )
    ).toBeDefined();
    const title = screen.getByRole("textbox", { name: TITLE });
    expect((title as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByRole("button", { name: "Add gestures" })).toBeNull();
    expect(screen.queryByTestId("lesson-save-status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Make a copy" }));
    await waitFor(() => {
      expect(calls.some((call) => call.path === "lessons/duplicate")).toBe(
        true
      );
    });
    expect(updates(calls)).toHaveLength(0);
  });
});
