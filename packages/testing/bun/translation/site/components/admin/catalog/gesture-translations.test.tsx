import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

const { renderSite, rpcError } = await import(
  "../../../../../../support/site/render"
);
const { GestureTranslations } = await import(
  "../../../../../../../../apps/site/src/components/admin/catalog/gesture-translations"
);
const { CategoryTranslations } = await import(
  "../../../../../../../../apps/site/src/components/admin/catalog/category-translations"
);
const { TranslationReportCard } = await import(
  "../../../../../../../../apps/site/src/components/admin/catalog/translation-report"
);

/*
 * Phase 10b task 5: the translation tabs of the gesture editor, the
 * categories' names per language and the needs-translation report, over a
 * fake API (the screens render in English with the shipped three languages,
 * so the tabs are Français and English... the default Nederlands is the source).
 */

const GESTURE = {
  id: "g1",
  published: true,
  slug: "hond",
  source: {
    description: "Een trouwe hond.",
    keywords: ["hondje"],
    name: "Hond",
  },
  translations: {
    fr: {
      description: "Un chien fidèle.",
      keywords: ["toutou"],
      name: "Chien",
      updatedAt: 1000,
    },
  },
};

const FRENCH_TAB = /Français/;
const ENGLISH_TAB = /English/;
const DUTCH_TAB = /Nederlands/;
const ENGLISH_DESCRIPTION = /^Description in English/;

/** Radix tabs open on a mouse down. */
async function openTab(name: RegExp): Promise<HTMLElement> {
  const tab = await screen.findByRole("tab", { name });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
  return tab;
}

interface Call {
  input: unknown;
  path: string;
}

function saves(calls: Call[], path: string): unknown[] {
  return calls.filter((call) => call.path === path).map((call) => call.input);
}

describe("GestureTranslations", () => {
  test("one tab per other language with its status, the source text beside the fields", async () => {
    await renderSite(
      () => (
        <div data-testid="page">
          <GestureTranslations gestureId="g1" />
        </div>
      ),
      { api: { "catalogTranslation/gestures/get": GESTURE } }
    );
    const french = await screen.findByRole("tab", { name: FRENCH_TAB });
    const english = screen.getByRole("tab", { name: ENGLISH_TAB });
    expect(within(french).getByText("Translated")).toBeDefined();
    expect(within(english).getByText("Needs translation")).toBeDefined();
    // The default language is the source, not a tab.
    expect(screen.queryByRole("tab", { name: DUTCH_TAB })).toBeNull();
    expect(screen.getAllByText("Source (Nederlands)").length).toBeGreaterThan(
      0
    );
    expect(screen.getAllByText("Een trouwe hond.").length).toBeGreaterThan(0);
    await openTab(FRENCH_TAB);
    const name = (await screen.findByRole("textbox", {
      name: "Name in Français",
    })) as HTMLInputElement;
    expect(name.value).toBe("Chien");
  });

  test("saves one language with the lock it read, then shows the saved state", async () => {
    const { calls } = await renderSite(
      () => (
        <div data-testid="page">
          <GestureTranslations gestureId="g1" />
        </div>
      ),
      {
        api: {
          "catalogTranslation/gestures/get": GESTURE,
          "catalogTranslation/gestures/save": { updatedAt: 2000 },
        },
      }
    );
    await openTab(FRENCH_TAB);
    const name = (await screen.findByRole("textbox", {
      name: "Name in Français",
    })) as HTMLInputElement;
    const save = screen.getByRole("button", { name: "Save translation" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(name, { target: { value: "Chien fidèle" } });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);
    expect(await screen.findByText("Translation saved.")).toBeDefined();
    expect(saves(calls, "catalogTranslation/gestures/save")).toEqual([
      {
        description: "Un chien fidèle.",
        expectedUpdatedAt: 1000,
        id: "g1",
        keywords: ["toutou"],
        locale: "fr",
        name: "Chien fidèle",
      },
    ]);
  });

  test("a first translation sends no lock, and a blank name is refused before any call", async () => {
    const { calls } = await renderSite(
      () => (
        <div data-testid="page">
          <GestureTranslations gestureId="g1" />
        </div>
      ),
      {
        api: {
          "catalogTranslation/gestures/get": GESTURE,
          "catalogTranslation/gestures/save": { updatedAt: 3000 },
        },
      }
    );
    await openTab(ENGLISH_TAB);
    const name = await screen.findByRole("textbox", {
      name: "Name in English",
    });
    const description = screen.getByRole("textbox", {
      name: ENGLISH_DESCRIPTION,
    });
    fireEvent.change(description, { target: { value: "A loyal dog." } });
    fireEvent.click(screen.getByRole("button", { name: "Save translation" }));
    expect(await screen.findByText("Enter a name.")).toBeDefined();
    expect(saves(calls, "catalogTranslation/gestures/save")).toEqual([]);
    fireEvent.change(name, { target: { value: "Dog" } });
    fireEvent.click(screen.getByRole("button", { name: "Save translation" }));
    await waitFor(() =>
      expect(saves(calls, "catalogTranslation/gestures/save")).toEqual([
        {
          description: "A loyal dog.",
          expectedUpdatedAt: null,
          id: "g1",
          keywords: [],
          locale: "en",
          name: "Dog",
        },
      ])
    );
  });

  test("a save that lost to another translator says so and reloads their text", async () => {
    await renderSite(
      () => (
        <div data-testid="page">
          <GestureTranslations gestureId="g1" />
        </div>
      ),
      {
        api: {
          "catalogTranslation/gestures/get": GESTURE,
          "catalogTranslation/gestures/save": rpcError("CONFLICT", 409, {
            reason: "stale",
          }),
        },
      }
    );
    await openTab(FRENCH_TAB);
    const name = await screen.findByRole("textbox", {
      name: "Name in Français",
    });
    fireEvent.change(name, { target: { value: "Toutou" } });
    fireEvent.click(screen.getByRole("button", { name: "Save translation" }));
    expect(
      await screen.findByText(
        "Someone else just saved this translation. The latest text has been loaded: check it and save again."
      )
    ).toBeDefined();
  });

  test("a lost save keeps the typed draft, offers their text and saves over it on request", async () => {
    let theirs = false;
    const newer = {
      ...GESTURE,
      translations: {
        fr: {
          description: "Un chien fidèle.",
          keywords: ["toutou"],
          name: "Médor",
          updatedAt: 2000,
        },
      },
    };
    const { calls } = await renderSite(
      () => (
        <div data-testid="page">
          <GestureTranslations gestureId="g1" />
        </div>
      ),
      {
        api: {
          "catalogTranslation/gestures/get": () => (theirs ? newer : GESTURE),
          "catalogTranslation/gestures/save": (input: unknown) => {
            if (
              (input as { expectedUpdatedAt: number }).expectedUpdatedAt ===
              1000
            ) {
              theirs = true;
              return rpcError("CONFLICT", 409, { reason: "stale" });
            }
            return { updatedAt: 3000 };
          },
        },
      }
    );
    await openTab(FRENCH_TAB);
    const name = (await screen.findByRole("textbox", {
      name: "Name in Français",
    })) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Toutou" } });
    fireEvent.click(screen.getByRole("button", { name: "Save translation" }));
    expect(await screen.findByText("Somebody was first")).toBeDefined();
    // Same node, same text: the form was not remounted.
    expect(
      screen.getByRole("textbox", {
        name: "Name in Français",
      }) as HTMLInputElement
    ).toBe(name);
    expect(name.value).toBe("Toutou");
    expect(screen.getByText("Médor / Un chien fidèle. / toutou")).toBeDefined();
    expect(
      (
        screen.getByRole("button", {
          name: "Save translation",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save mine anyway" }));
    expect(screen.queryByText("Somebody was first")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save translation" }));
    await waitFor(() =>
      expect(
        saves(calls, "catalogTranslation/gestures/save").map(
          (input) => (input as { expectedUpdatedAt: number }).expectedUpdatedAt
        )
      ).toEqual([1000, 2000])
    );
  });

  test("an unsaved draft survives a switch to another tab and back", async () => {
    await renderSite(
      () => (
        <div data-testid="page">
          <GestureTranslations gestureId="g1" />
        </div>
      ),
      { api: { "catalogTranslation/gestures/get": GESTURE } }
    );
    await openTab(FRENCH_TAB);
    const name = (await screen.findByRole("textbox", {
      name: "Name in Français",
    })) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Toutou" } });
    await openTab(ENGLISH_TAB);
    await screen.findByRole("textbox", { name: "Name in English" });
    await openTab(FRENCH_TAB);
    const again = (await screen.findByRole("textbox", {
      name: "Name in Français",
    })) as HTMLInputElement;
    expect(again.value).toBe("Toutou");
  });

  test("keeps the keyboard in the form after a save", async () => {
    await renderSite(
      () => (
        <div data-testid="page">
          <GestureTranslations gestureId="g1" />
        </div>
      ),
      {
        api: {
          "catalogTranslation/gestures/get": GESTURE,
          "catalogTranslation/gestures/save": { updatedAt: 2000 },
        },
      }
    );
    await openTab(FRENCH_TAB);
    const name = await screen.findByRole("textbox", {
      name: "Name in Français",
    });
    fireEvent.change(name, { target: { value: "Chien fidèle" } });
    const save = screen.getByRole("button", { name: "Save translation" });
    save.focus();
    fireEvent.click(save);
    await screen.findByText("Translation saved.");
    expect(document.activeElement).toBe(name);
  });
});

describe("CategoryTranslations", () => {
  const LIST = {
    items: [
      {
        id: "c1",
        name: "Dieren",
        needsTranslation: false,
        published: true,
        slug: "dieren",
        translation: { name: "Animaux", updatedAt: 500 },
      },
      {
        id: "c2",
        name: "Eten",
        needsTranslation: true,
        published: true,
        slug: "eten",
        translation: null,
      },
    ],
    report: {
      categories: { missing: 1, total: 2 },
      gestures: {
        missingDescription: 0,
        missingKeywords: 0,
        missingName: 0,
        needsTranslation: 0,
        total: 0,
      },
      locale: "fr",
    },
  };

  test("lists the categories of the language and saves one name with its lock", async () => {
    const { calls } = await renderSite(
      () => (
        <div data-testid="page">
          <CategoryTranslations />
        </div>
      ),
      {
        api: {
          "catalogTranslation/categories/list": LIST,
          "catalogTranslation/categories/save": { updatedAt: 900 },
        },
      }
    );
    await openTab(FRENCH_TAB);
    const eten = (await screen.findByRole("textbox", {
      name: "Name in Français: Eten",
    })) as HTMLInputElement;
    expect(eten.value).toBe("");
    expect(
      (
        await screen.findByRole("textbox", {
          name: "Name in Français: Dieren",
        })
      ).getAttribute("placeholder")
    ).toBe("Dieren");
    fireEvent.change(eten, { target: { value: "Nourriture" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save the translation of Eten" })
    );
    expect(await screen.findByText("Name saved.")).toBeDefined();
    expect(saves(calls, "catalogTranslation/categories/save")).toEqual([
      { expectedUpdatedAt: null, id: "c2", locale: "fr", name: "Nourriture" },
    ]);
  });

  test("a typed name survives a tab switch and a lost save, and the other name is offered", async () => {
    let theirs = false;
    const answer = () =>
      theirs
        ? {
            ...LIST,
            items: [
              LIST.items[0],
              {
                ...LIST.items[1],
                needsTranslation: false,
                translation: { name: "Repas", updatedAt: 800 },
              },
            ],
          }
        : LIST;
    await renderSite(
      () => (
        <div data-testid="page">
          <CategoryTranslations />
        </div>
      ),
      {
        api: {
          "catalogTranslation/categories/list": answer,
          "catalogTranslation/categories/save": () => {
            theirs = true;
            return rpcError("CONFLICT", 409, { reason: "stale" });
          },
        },
      }
    );
    await openTab(FRENCH_TAB);
    const eten = (await screen.findByRole("textbox", {
      name: "Name in Français: Eten",
    })) as HTMLInputElement;
    fireEvent.change(eten, { target: { value: "Nourriture" } });
    await openTab(ENGLISH_TAB);
    await openTab(FRENCH_TAB);
    expect(
      (
        (await screen.findByRole("textbox", {
          name: "Name in Français: Eten",
        })) as HTMLInputElement
      ).value
    ).toBe("Nourriture");
    fireEvent.click(
      screen.getByRole("button", { name: "Save the translation of Eten" })
    );
    expect(await screen.findByText("Somebody was first")).toBeDefined();
    expect(eten.value).toBe("Nourriture");
    expect(screen.getByText("Repas")).toBeDefined();
  });
});

const shown: string[] = [];

function collectShown(locale: string): void {
  shown.push(locale);
}

describe("TranslationReportCard", () => {
  const REPORTS = [
    {
      categories: { missing: 1, total: 4 },
      gestures: {
        missingDescription: 2,
        missingKeywords: 3,
        missingName: 5,
        needsTranslation: 8,
        total: 20,
      },
      locale: "fr",
    },
    {
      categories: { missing: 0, total: 4 },
      gestures: {
        missingDescription: 0,
        missingKeywords: 0,
        missingName: 0,
        needsTranslation: 0,
        total: 20,
      },
      locale: "en",
    },
  ];

  test("counts per language, with the filter action only where something is missing", async () => {
    shown.length = 0;
    await renderSite(
      () => (
        <div data-testid="page">
          <TranslationReportCard onShow={collectShown} />
        </div>
      ),
      { api: { "catalogTranslation/reports": REPORTS } }
    );
    expect(
      await screen.findByText("8 of 20 gestures need a translation")
    ).toBeDefined();
    expect(screen.getByText("Everything is translated")).toBeDefined();
    expect(
      screen.getByText("Missing a name: 5, a description: 2, keywords: 3")
    ).toBeDefined();
    const buttons = screen.getAllByRole("button", {
      name: "Show what still needs translating",
    });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0] as HTMLElement);
    expect(shown).toEqual(["fr"]);
  });
});
