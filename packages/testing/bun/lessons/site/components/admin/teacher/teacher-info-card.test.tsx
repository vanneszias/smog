import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

const { renderSite, rpcError } = await import(
  "../../../../../../support/site/render"
);
const { TeacherInfoCard } = await import(
  "../../../../../../../../apps/site/src/components/admin/teacher/teacher-info-card"
);

/*
 * Phase 10c task 2: the "Teacher info" tabs over a fake API (English UI, the
 * shipped three languages: Nederlands is the default and the first tab).
 */

const ROW_NL = {
  bw: "naar voor",
  cNote: "op lettergrepen",
  gestureId: "g1",
  hc: "vlakke hand",
  locale: "nl",
  note: "",
  or: "",
  pl: "voor de borst",
  summary: "groeten",
  updatedAt: 1000,
  version: 2,
};

const DETAIL = {
  defaultLocale: "nl",
  gesture: { id: "g1", name: "Hallo", published: true, slug: "hallo" },
  keywords: { fr: ["bonjour"], nl: ["dag", "goeiedag"] },
  rows: { nl: ROW_NL },
};

const DUTCH_TAB = /Nederlands/;
const FRENCH_TAB = /Français/;
const HC_LABEL = /^HC \(handshape\)/;
const PL_LABEL = /^PL \(place\)/;
const ENGLISH_TAB = /English/;
const C_NOTE_LABEL = /^C \(related meanings\), private note/;
const THEIR_TEXT = /gebogen hand/;
const READ_ONLY_NOTICE = /only a teacher or an admin writes in Nederlands/;
const TRY_AGAIN = /try again/i;
const SAVE = "Save teacher information";

async function openTab(name: RegExp): Promise<void> {
  const tab = await screen.findByRole("tab", { name });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
}

function page(canAuthor: boolean) {
  return () => (
    <div data-testid="page">
      <TeacherInfoCard canAuthor={canAuthor} gestureId="g1" />
    </div>
  );
}

function sent(calls: { input: unknown; path: string }[]): unknown[] {
  return calls
    .filter((call) => call.path === "teacher/saveInfo")
    .map((call) => call.input);
}

describe("TeacherInfoCard", () => {
  test("leaving with unsaved text in any language asks first; a saved card lets go", async () => {
    const { router } = await renderSite(page(true), {
      api: { "teacher/getInfo": DETAIL },
    });
    const hc = (await screen.findByRole("textbox", {
      name: HC_LABEL,
    })) as HTMLTextAreaElement;
    // A clean card never asks.
    await router.navigate({ to: "/ergens" as never });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await router.navigate({ to: "/" as never });
    const again = (await screen.findByRole("textbox", {
      name: HC_LABEL,
    })) as HTMLTextAreaElement;
    expect(again.value).toBe(hc.value === "" ? "" : "vlakke hand");
    fireEvent.change(again, { target: { value: "andere hand" } });
    router.navigate({ to: "/elders" as never }).catch(() => undefined);
    const ask = await screen.findByRole("alertdialog", {
      name: "Leave without saving?",
    });
    fireEvent.click(within(ask).getByRole("button", { name: "Stay" }));
    expect(router.state.location.pathname).toBe("/");
  });

  test("a tab per language, the default first and filled, the public keywords above the private C note", async () => {
    await renderSite(page(true), { api: { "teacher/getInfo": DETAIL } });
    const dutch = await screen.findByRole("tab", { name: DUTCH_TAB });
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toBe(dutch);
    expect(within(dutch).getByText("Filled in")).toBeDefined();
    expect(
      within(screen.getByRole("tab", { name: FRENCH_TAB })).getByText("Empty")
    ).toBeDefined();
    const hc = (await screen.findByRole("textbox", {
      name: HC_LABEL,
    })) as HTMLTextAreaElement;
    expect(hc.value).toBe("vlakke hand");
    expect(screen.getByText("goeiedag")).toBeDefined();
    expect(screen.getAllByText(C_NOTE_LABEL).length).toBeGreaterThan(0);
  });

  test("a translation tab shows the default text as the reference and saves with the version it has none of", async () => {
    const { calls } = await renderSite(page(true), {
      api: {
        "teacher/getInfo": DETAIL,
        "teacher/saveInfo": { version: 1 },
      },
    });
    await openTab(FRENCH_TAB);
    expect(
      (await screen.findAllByText("Reference (Nederlands)")).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("vlakke hand").length).toBeGreaterThan(0);
    const frenchTab = screen.getByRole("tabpanel", { name: FRENCH_TAB });
    const hc = within(frenchTab).getByRole("textbox", {
      name: HC_LABEL,
    });
    const save = within(frenchTab).getByRole("button", { name: SAVE });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(hc, { target: { value: "main plate" } });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);
    expect(await screen.findByText("Teacher information saved.")).toBeDefined();
    expect(sent(calls)).toEqual([
      {
        expectedVersion: null,
        fields: {
          bw: "",
          cNote: "",
          hc: "main plate",
          note: "",
          or: "",
          pl: "",
          summary: "",
        },
        gestureId: "g1",
        locale: "fr",
      },
    ]);
  });

  test("a save with the lock it read; the next save uses the new version", async () => {
    let version = 2;
    const { calls } = await renderSite(page(true), {
      api: {
        "teacher/getInfo": () => ({
          ...DETAIL,
          rows: { nl: { ...ROW_NL, version } },
        }),
        "teacher/saveInfo": () => {
          version += 1;
          return { version };
        },
      },
    });
    const pl = (await screen.findByRole("textbox", {
      name: PL_LABEL,
    })) as HTMLTextAreaElement;
    fireEvent.change(pl, { target: { value: "bij het oor" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    expect(await screen.findByText("Teacher information saved.")).toBeDefined();
    fireEvent.change(pl, { target: { value: "bij de mond" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => expect(sent(calls)).toHaveLength(2));
    expect(
      sent(calls).map(
        (input) => (input as { expectedVersion: number }).expectedVersion
      )
    ).toEqual([2, 3]);
  });

  test("a lost lock offers the other text: use theirs replaces the draft", async () => {
    // Somebody else's save landed first: the server holds their row from now on.
    let stored = ROW_NL;
    const theirs = { ...ROW_NL, hc: "gebogen hand", version: 3 };
    await renderSite(page(true), {
      api: {
        "teacher/getInfo": () => ({ ...DETAIL, rows: { nl: stored } }),
        "teacher/saveInfo": () => {
          stored = theirs;
          return rpcError("CONFLICT", 409, {
            current: theirs,
            reason: "stale",
          });
        },
      },
    });
    const hc = (await screen.findByRole("textbox", {
      name: HC_LABEL,
    })) as HTMLTextAreaElement;
    fireEvent.change(hc, { target: { value: "mijn tekst" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    expect(await screen.findByText(THEIR_TEXT)).toBeDefined();
    // My draft is kept, and saving is held until a choice is made.
    expect(hc.value).toBe("mijn tekst");
    const save = screen.getByRole("button", { name: SAVE });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Use their version" }));
    expect(hc.value).toBe("gebogen hand");
  });

  test("a translator reads the default language, cannot write it, and starts on a language they can write", async () => {
    await renderSite(page(false), { api: { "teacher/getInfo": DETAIL } });
    const english = await screen.findByRole("tab", { name: ENGLISH_TAB });
    expect(english.getAttribute("aria-selected")).toBe("true");
    // Tabs stay mounted: the first (default language) panel is hidden here.
    const [hc] = screen.getAllByRole("textbox", {
      hidden: true,
      name: HC_LABEL,
    }) as HTMLTextAreaElement[];
    expect(hc?.lang).toBe("nl");
    expect(hc?.readOnly).toBe(true);
    expect(
      screen.getAllByText(READ_ONLY_NOTICE, {
        ignore: "none",
      }).length
    ).toBeGreaterThan(0);
    // Saving is offered for English and French only, never for Dutch.
    expect(
      screen.getAllByRole("button", { hidden: true, name: SAVE })
    ).toHaveLength(2);
  });

  test("a failed load shows the retry state", async () => {
    await renderSite(page(true), {
      api: { "teacher/getInfo": rpcError("FORBIDDEN", 403) },
    });
    expect(
      await screen.findByRole("button", { name: TRY_AGAIN })
    ).toBeDefined();
  });
});
