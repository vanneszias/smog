import { describe, expect, test } from "bun:test";
import type {
  StringCell,
  StringRow,
  StringsPage,
} from "@smog/translation/schema";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderSite, rpcError } from "@/test/render";
import { StringsTable } from "./strings-table";

const MUST_MATCH = /must match the source: name/;

function cell(overrides: Partial<StringCell> = {}): StringCell {
  return {
    applicable: true,
    issues: [],
    missing: false,
    overridden: false,
    stale: false,
    updatedAt: null,
    value: "Een tekst",
    ...overrides,
  };
}

const ROWS: StringRow[] = [
  {
    cells: {
      de: cell({ missing: true, value: null }),
      en: cell({ overridden: true, updatedAt: 1000, value: "A text" }),
      nl: cell({ value: "Een tekst" }),
    },
    key: "demo.text",
    namespace: "demo",
    source: "Een tekst",
  },
  {
    cells: {
      de: cell({ missing: true, value: null }),
      en: cell({
        overridden: true,
        stale: true,
        updatedAt: 2000,
        value: "Hello {{name}}",
      }),
      nl: cell({ value: "Hallo {{name}}" }),
    },
    key: "demo.hello",
    namespace: "demo",
    source: "Hallo {{name}}",
  },
];

const PAGE: StringsPage = {
  items: ROWS,
  languages: ["nl", "en", "de"],
  namespaces: ["demo"],
  offset: 0,
  total: 2,
};

const LANGUAGES = {
  items: [
    {
      code: "nl",
      enabled: true,
      intlTag: "nl-BE",
      isDefault: true,
      name: "Dutch",
      sortOrder: 0,
    },
    {
      code: "en",
      enabled: true,
      intlTag: "en-BE",
      isDefault: false,
      name: "English",
      sortOrder: 1,
    },
    {
      code: "de",
      enabled: true,
      intlTag: "de-BE",
      isDefault: false,
      name: "German",
      sortOrder: 2,
    },
  ],
};

function ignoreSearch(): void {
  // The URL is not under test here.
}

const NO_FILTERS = {};
const FILTERED = {
  lang: "de",
  page: 2,
  q: "tekst",
  status: "missing",
} as const;

function Page(): ReactNode {
  return (
    <div data-testid="page">
      <StringsTable onSearchChange={ignoreSearch} search={NO_FILTERS} />
    </div>
  );
}

function FilteredPage(): ReactNode {
  return (
    <div data-testid="page">
      <StringsTable onSearchChange={ignoreSearch} search={FILTERED} />
    </div>
  );
}

function saveCalls(
  calls: { input: unknown; path: string }[]
): { input: Record<string, unknown> }[] {
  return calls
    .filter((call) => call.path === "translation/strings/save")
    .map((call) => ({ input: call.input as Record<string, unknown> }));
}

describe("the strings table", () => {
  test("shows each language's text with missing and stale chips", async () => {
    await renderSite(Page, {
      api: {
        "translation/languages/list": LANGUAGES,
        "translation/strings/list": PAGE,
      },
    });
    expect(await screen.findByText("A text")).toBeDefined();
    expect(screen.getByText("Strings: 2")).toBeDefined();
    // Two German cells are missing, one English text is outdated.
    expect(screen.getAllByText("Missing").length).toBe(2);
    expect(screen.getAllByText("Source changed").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Confirm demo.hello in English" })
    ).toBeDefined();
  });

  test("saves an edit with the token of what it saw and shows it before the answer", async () => {
    let answer: (value: unknown) => void = () => undefined;
    const held = new Promise((resolve) => {
      answer = resolve;
    });
    const { calls } = await renderSite(Page, {
      api: {
        "translation/languages/list": LANGUAGES,
        "translation/strings/list": PAGE,
        "translation/strings/save": () => held,
      },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit demo.text in English" })
    );
    const box = await screen.findByRole("textbox", {
      name: "Text of demo.text in English",
    });
    fireEvent.change(box, { target: { value: "A better text" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // Shown at once, while the request is still open.
    expect(await screen.findByText("A better text")).toBeDefined();
    await waitFor(() => expect(saveCalls(calls)).toHaveLength(1));
    expect(saveCalls(calls)[0]?.input).toEqual({
      expectedUpdatedAt: 1000,
      key: "demo.text",
      locale: "en",
      value: "A better text",
    });
    answer({
      cell: cell({ overridden: true, updatedAt: 3000, value: "A better text" }),
      key: "demo.text",
      locale: "en",
    });
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(screen.getByText("A better text")).toBeDefined();
  });

  test("keeps the editor open with an error, and sends nothing, for broken placeholders", async () => {
    const { calls } = await renderSite(Page, {
      api: {
        "translation/languages/list": LANGUAGES,
        "translation/strings/list": PAGE,
      },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit demo.hello in English" })
    );
    const box = await screen.findByRole("textbox", {
      name: "Text of demo.hello in English",
    });
    fireEvent.change(box, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findAllByText(MUST_MATCH)).length).toBeGreaterThan(0);
    expect(saveCalls(calls)).toHaveLength(0);
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  test("shows the other version after a lost save and lets the person take it", async () => {
    await renderSite(Page, {
      api: {
        "translation/languages/list": LANGUAGES,
        "translation/strings/list": PAGE,
        "translation/strings/save": rpcError("CONFLICT", 409, {
          current: cell({ overridden: true, updatedAt: 5000, value: "Theirs" }),
          reason: "stale",
        }),
      },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit demo.text in English" })
    );
    fireEvent.change(
      await screen.findByRole("textbox", {
        name: "Text of demo.text in English",
      }),
      { target: { value: "Mine" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const editor = await screen.findByTestId("editor-en");
    expect(within(editor).getByText("Somebody was first")).toBeDefined();
    expect(within(editor).getByText("Theirs")).toBeDefined();
    fireEvent.click(
      within(editor).getByRole("button", { name: "Use their version" })
    );
    const box = within(editor).getByRole("textbox") as HTMLTextAreaElement;
    expect(box.value).toBe("Theirs");
  });

  test("asks for the strings of the page's filters", async () => {
    const { calls } = await renderSite(FilteredPage, {
      api: {
        "translation/languages/list": LANGUAGES,
        "translation/strings/list": PAGE,
      },
    });
    await screen.findByText("A text");
    const list = calls.find((call) => call.path === "translation/strings/list");
    expect(list?.input).toMatchObject({
      limit: 100,
      locale: "de",
      offset: 100,
      search: "tekst",
      status: "missing",
    });
  });
});
