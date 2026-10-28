import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "expo-router/testing-library";
import { shareAsync } from "expo-sharing";
import { renderApp, rpcError } from "../test/harness";

// The real auth client (Better Auth, SecureStore) is never built: tests pass fakes.
jest.mock("@smog/auth/expo", () => ({ createExpoAuthClient: jest.fn() }));
jest.mock("../../global.css", () => ({}));
jest.mock("nativewind", () => {
  const actual = jest.requireActual<typeof import("nativewind")>("nativewind");
  return {
    ...actual,
    useColorScheme: () => ({
      colorScheme: "light",
      setColorScheme: () => undefined,
      toggleColorScheme: () => undefined,
    }),
  };
});

const { mockFiles } = jest.requireMock("expo-file-system") as {
  mockFiles: Map<string, string>;
};

const LESSON_ID = "11111111-1111-4111-8111-111111111111";

const LIST = {
  items: [
    {
      authorName: "Els",
      canEdit: false,
      gestureCount: 2,
      id: LESSON_ID,
      mine: false,
      number: 3,
      title: "Dieren",
      titleLocale: "nl",
      updatedAt: 1,
      version: 4,
    },
    {
      authorName: null,
      canEdit: false,
      gestureCount: 0,
      id: "l-2",
      mine: false,
      number: null,
      title: "Animals",
      titleLocale: "en",
      updatedAt: 0,
      version: 1,
    },
  ],
  nextCursor: null,
};

const ITEM = {
  hasDrawing: false,
  id: "g-hond",
  name: "Hond",
  playbackId: "playback-hond",
  published: true,
  slug: "hond",
};

const DETAIL = {
  authorId: "u-els",
  authorName: "Els",
  canEdit: false,
  createdAt: 0,
  id: LESSON_ID,
  number: 3,
  sections: [
    {
      id: "s-1",
      items: [
        {
          ...ITEM,
          id: "g-oud",
          name: "Oud gebaar",
          published: false,
          slug: "oud",
        },
      ],
      titles: { en: "Pets", nl: "Huisdieren" },
    },
  ],
  translations: {
    en: { notes: "Bring the cards.", title: "Animals" },
    nl: { notes: "Neem de kaarten mee.", title: "Dieren" },
  },
  ungrouped: [ITEM],
  updatedAt: 1,
  version: 4,
};

const PREVIEW = {
  gestures: 1,
  issues: [
    {
      fallback: true,
      id: "g-hond",
      missing: false,
      name: "Hond",
      noDrawing: false,
      unsupportedDrawing: false,
    },
  ],
  limit: 150,
  overLimit: false,
  skipped: [{ id: "g-oud", name: "Oud gebaar" }],
};

const ROUTES = {
  "lessons/exportPreview": PREVIEW,
  "lessons/get": DETAIL,
  "lessons/list": LIST,
};

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  mockFiles.clear();
});

async function goTo(path: "/settings/lessons" | `/settings/lessons/${string}`) {
  await act(() => {
    router.push(path as never);
  });
}

function lessonRequests(
  fetch: { mock: { calls: unknown[][] } },
  path: string
): number {
  return fetch.mock.calls.filter(([request]) =>
    (request as Request).url.includes(`/api/rpc/${path}`)
  ).length;
}

describe("the role gate", () => {
  it("a teacher sees the entry in settings and it opens the list", async () => {
    await renderApp({
      realSettings: true,
      roles: ["teacher"],
      routes: ROUTES,
      signedIn: true,
    });
    await goTo("/settings" as never);
    await fireEvent.press(await screen.findByTestId("settings-lessons"));
    expect(await screen.findByText("Dieren")).toBeOnTheScreen();
  });

  it("an admin sees it too", async () => {
    await renderApp({
      realSettings: true,
      roles: ["admin"],
      routes: ROUTES,
      signedIn: true,
    });
    await goTo("/settings" as never);
    expect(await screen.findByTestId("settings-lessons")).toBeOnTheScreen();
  });

  it.each([
    ["a plain account", { roles: [], signedIn: true }],
    ["a translator", { roles: ["translator"], signedIn: true }],
    ["a guest", { signedIn: false }],
  ])("%s has no entry and the screen asks nothing", async (_name, options) => {
    const { fetch } = await renderApp({
      realSettings: true,
      routes: ROUTES,
      ...options,
    });
    await goTo("/settings" as never);
    await screen.findByText("About the app");
    expect(screen.queryByTestId("settings-lessons")).not.toBeOnTheScreen();
    await goTo("/settings/lessons");
    expect(await screen.findByTestId("lessons-forbidden")).toBeOnTheScreen();
    expect(screen.getByText("Only for teachers")).toBeOnTheScreen();
    expect(lessonRequests(fetch, "lessons/list")).toBe(0);
  });
});

describe("the list", () => {
  it("shows title, number, gestures and author, and flags a title in another language", async () => {
    await renderApp({ roles: ["teacher"], routes: ROUTES, signedIn: true });
    await goTo("/settings/lessons");
    const row = within(await screen.findByTestId(`lesson-row-${LESSON_ID}`));
    expect(row.getByText("Dieren")).toBeOnTheScreen();
    expect(row.getByText("Lesson 3 · 2 gestures · By Els")).toBeOnTheScreen();
    // The app is in English; this title is Dutch.
    expect(row.getByText("NL")).toBeOnTheScreen();
    const other = within(screen.getByTestId("lesson-row-l-2"));
    expect(other.getByText("0 gestures")).toBeOnTheScreen();
    expect(other.queryByText("EN")).not.toBeOnTheScreen();
  });

  it("has an empty state", async () => {
    await renderApp({
      roles: ["teacher"],
      routes: { "lessons/list": { items: [], nextCursor: null } },
      signedIn: true,
    });
    await goTo("/settings/lessons");
    expect(await screen.findByText("No lessons yet")).toBeOnTheScreen();
  });

  it("has an error state with a retry", async () => {
    const state: { fail: boolean } = { fail: true };
    await renderApp({
      roles: ["teacher"],
      routes: {
        "lessons/list": () =>
          state.fail
            ? { response: rpcError("INTERNAL_SERVER_ERROR", 500) }
            : LIST,
      },
      signedIn: true,
    });
    await goTo("/settings/lessons");
    const retry = await screen.findByRole("button", { name: "Try again" });
    state.fail = false;
    await fireEvent.press(retry);
    expect(await screen.findByText("Dieren")).toBeOnTheScreen();
  });
});

describe("a lesson", () => {
  it("is read only: sections, gestures, notes, an unpublished one flagged", async () => {
    await renderApp({ roles: ["teacher"], routes: ROUTES, signedIn: true });
    await goTo(`/settings/lessons/${LESSON_ID}`);
    // English title and notes: the app's language.
    expect(
      await screen.findByRole("header", { name: "Animals" })
    ).toBeOnTheScreen();
    expect(screen.getByText("Bring the cards.")).toBeOnTheScreen();
    const section = within(screen.getByTestId("lesson-section-s-1"));
    expect(section.getByRole("header", { name: "Pets" })).toBeOnTheScreen();
    expect(section.getByText("Not published")).toBeOnTheScreen();
    // Not a button: an unpublished gesture has no page to open.
    expect(screen.getByTestId("lesson-gesture-g-hond")).toBeOnTheScreen();
    expect(screen.queryByTestId("lesson-gesture-g-oud-button")).toBeNull();
    // No builder: nothing edits.
  });

  it("opens a gesture", async () => {
    const { result } = await renderApp({
      roles: ["teacher"],
      routes: ROUTES,
      signedIn: true,
    });
    await goTo(`/settings/lessons/${LESSON_ID}`);
    await fireEvent.press(await screen.findByTestId("lesson-gesture-g-hond"));
    await waitFor(() => expect(result.getPathname()).toBe("/gestures/hond"));
  });

  it("an unknown lesson says so", async () => {
    await renderApp({
      roles: ["teacher"],
      routes: { "lessons/get": { response: rpcError("NOT_FOUND", 404) } },
      signedIn: true,
    });
    await goTo(`/settings/lessons/${LESSON_ID}`);
    expect(await screen.findByText("Lesson not found")).toBeOnTheScreen();
  });
});

describe("the export", () => {
  async function openExport(routes: Record<string, unknown> = ROUTES) {
    const app = await renderApp({
      roles: ["teacher"],
      routes: routes as never,
      signedIn: true,
    });
    await goTo(`/settings/lessons/${LESSON_ID}`);
    await fireEvent.press(await screen.findByTestId("lesson-export"));
    await screen.findByTestId("export-sheet");
    await waitFor(() =>
      expect(
        screen.queryByTestId("export-preview") ??
          screen.queryByTestId("export-over-limit")
      ).toBeOnTheScreen()
    );
    return app;
  }

  it("shows what the PDF will hold and its gaps", async () => {
    await openExport();
    const preview = within(screen.getByTestId("export-sheet"));
    expect(preview.getByText("1 gesture goes into the PDF.")).toBeOnTheScreen();
    expect(preview.getByText("Oud gebaar")).toBeOnTheScreen();
    expect(
      preview.getByText("Hond: Text in the default language")
    ).toBeOnTheScreen();
  });

  it("downloads through the authenticated route and opens the share sheet", async () => {
    const pdf = jest.fn<typeof fetch>(() =>
      Promise.resolve(new Response(new TextEncoder().encode("%PDF-1.7")))
    );
    await openExport();
    global.fetch = pdf as unknown as typeof fetch;
    let shared: string | undefined;
    (shareAsync as jest.Mock).mockImplementationOnce((path: unknown) => {
      shared = mockFiles.get(path as string);
      return Promise.resolve();
    });
    await fireEvent.press(screen.getByTestId("export-download"));
    await waitFor(() => expect(shareAsync).toHaveBeenCalled());
    expect(pdf).toHaveBeenCalledWith(
      `https://smog.test/api/teacher/lessons/${LESSON_ID}/pdf?locale=en&template=teachers`,
      { credentials: "omit", headers: { cookie: "smog.session_token=t" } }
    );
    const [uri, options] = (shareAsync as jest.Mock).mock.calls[0] as [
      string,
      Record<string, string>,
    ];
    expect(uri).toBe("file:///cache/les-11111111-teachers-en.pdf");
    expect(options).toMatchObject({ mimeType: "application/pdf" });
    expect(shared).toBe("%PDF-1.7");
    // Private material: gone once the sheet closed (iOS).
    await waitFor(() => expect(mockFiles.has(uri)).toBe(false));
  });

  it("the participants' sheet asks for its own template", async () => {
    const pdf = jest.fn(() =>
      Promise.resolve(new Response(new TextEncoder().encode("%PDF")))
    );
    await openExport();
    global.fetch = pdf as unknown as typeof fetch;
    await fireEvent.press(
      screen.getByRole("radio", { name: "For participants" })
    );
    await waitFor(() =>
      expect(screen.getByTestId("export-download")).toBeEnabled()
    );
    await fireEvent.press(screen.getByTestId("export-download"));
    await waitFor(() => expect(pdf).toHaveBeenCalled());
    expect((pdf.mock.calls[0] as unknown[])[0]).toContain(
      "template=participants"
    );
  });

  it("a lesson over the template's cap cannot be downloaded", async () => {
    await openExport({
      ...ROUTES,
      "lessons/exportPreview": {
        ...PREVIEW,
        gestures: 200,
        issues: [],
        overLimit: true,
        skipped: [],
      },
    });
    expect(screen.getByTestId("export-over-limit")).toBeOnTheScreen();
    expect(screen.getByTestId("export-download")).toBeDisabled();
  });

  it.each([
    [
      422,
      "TOO_MANY",
      "This lesson has too many gestures for this PDF. Split the lesson in two.",
    ],
    [
      422,
      "TOO_LARGE",
      "The PDF is too large. Split the lesson or use smaller drawings.",
    ],
    [
      504,
      "TIMEOUT",
      "Making the PDF took too long. Split the lesson in two and try again.",
    ],
    [
      429,
      "RATE_LIMITED",
      "You just made a lot of PDFs. Wait a moment and try again.",
    ],
    [403, "FORBIDDEN", "Only teachers can make this PDF."],
  ])("a %i %s answer is explained", async (status, code, message) => {
    await openExport();
    global.fetch = jest.fn(() =>
      Promise.resolve(Response.json({ code }, { status }))
    ) as unknown as typeof fetch;
    await fireEvent.press(screen.getByTestId("export-download"));
    expect(await screen.findByTestId("export-error")).toBeOnTheScreen();
    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it("offline says so and shares nothing", async () => {
    const error = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await openExport();
    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError("Network request failed"))
    ) as unknown as typeof fetch;
    await fireEvent.press(screen.getByTestId("export-download"));
    expect(
      await screen.findByText(
        "No connection. Connect to the internet and try again."
      )
    ).toBeOnTheScreen();
    expect(shareAsync).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("a device with no share sheet says so", async () => {
    const { isAvailableAsync } = jest.requireMock("expo-sharing") as {
      isAvailableAsync: jest.Mock;
    };
    isAvailableAsync.mockImplementationOnce(() => Promise.resolve(false));
    await openExport();
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(new TextEncoder().encode("%PDF")))
    ) as unknown as typeof fetch;
    await fireEvent.press(screen.getByTestId("export-download"));
    expect(
      await screen.findByText("This device can't share files.")
    ).toBeOnTheScreen();
    expect(shareAsync).not.toHaveBeenCalled();
    expect(mockFiles.size).toBe(0);
  });
});
