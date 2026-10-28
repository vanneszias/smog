// biome-ignore-all lint/performance/noAwaitInLoops: each case renders, downloads and is read in turn.
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

const { renderSite, rpcError } = await import(
  "../../../../../../support/site/render"
);
const { LessonExportDialog } = await import(
  "../../../../../../../../apps/site/src/components/admin/lessons/lesson-export-dialog"
);

/*
 * Phase 10c review fix wave (B-m5): the export dialog over a fake API and a
 * stubbed `fetch` for the PDF route: the download waits while the builder has
 * unsaved changes, every refusal of the route shows its own message (a lost
 * session and a lost role included), a failed preview blocks the download, and
 * a preview with text the font lacks says so.
 */

const PREVIEW = {
  gestures: 2,
  issues: [],
  limit: 150,
  overLimit: false,
  skipped: [],
  unsupportedLessonText: false,
};

const DOWNLOAD = "Download PDF";
const COULD_NOT_LOAD = "The overview could not be loaded. Try again.";
const SPENT = new Map<string, string>([
  [
    "TOO_MANY",
    "This lesson has too many gestures for this PDF. Split the lesson in two.",
  ],
  [
    "TOO_LARGE",
    "The PDF is too large. Split the lesson or use smaller drawings.",
  ],
  [
    "TIMEOUT",
    "Making the PDF took too long. Split the lesson in two and try again.",
  ],
  ["RATE_LIMITED", "You just made a lot of PDFs. Wait a moment and try again."],
]);

const STATUS: Record<string, number> = { RATE_LIMITED: 429, TIMEOUT: 504 };

const CLEAN = /are filled in/;
const noop = (): void => undefined;

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function refuse(status: number, code?: string): void {
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(code ? JSON.stringify({ code }) : "", {
        headers: { "content-type": "application/json" },
        status,
      })
    )) as unknown as typeof fetch;
}

function dialog(pending = false) {
  return () => (
    <div data-testid="page">
      <LessonExportDialog
        lessonId="l1"
        onClose={noop}
        pending={pending}
        version={3}
      />
    </div>
  );
}

async function download(): Promise<void> {
  const button = await screen.findByRole("button", { name: DOWNLOAD });
  await waitFor(() => {
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
  fireEvent.click(button);
}

describe("LessonExportDialog", () => {
  test("the download waits while the builder holds unsaved changes", async () => {
    await renderSite(dialog(true), {
      api: { "lessons/exportPreview": PREVIEW },
    });
    const button = (await screen.findByRole("button", {
      name: DOWNLOAD,
    })) as HTMLButtonElement;
    expect(
      await screen.findByText("2 gestures go into the PDF.")
    ).toBeDefined();
    expect(button.disabled).toBe(true);
  });

  test("each refusal of the route has its own message", async () => {
    for (const [code, message] of SPENT) {
      refuse(STATUS[code] ?? 422, code);
      await renderSite(dialog(), {
        api: { "lessons/exportPreview": PREVIEW },
      });
      await download();
      expect(await screen.findByText(message), code).toBeDefined();
      cleanup();
    }
  });

  test("a session that ended says to sign in again, a role that was taken away says so, anything else is generic", async () => {
    const cases: [number, string | undefined, string][] = [
      [
        401,
        undefined,
        "Your session has expired. Sign in again and try again.",
      ],
      [
        403,
        "FORBIDDEN",
        "Your account may no longer make this PDF. Ask an administrator.",
      ],
      [500, undefined, "The PDF could not be made. Try again."],
    ];
    for (const [status, code, message] of cases) {
      refuse(status, code);
      await renderSite(dialog(), {
        api: { "lessons/exportPreview": PREVIEW },
      });
      await download();
      expect(await screen.findByText(message), String(status)).toBeDefined();
      cleanup();
    }
  });

  test("a failed preview blocks the download", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => undefined);
    await renderSite(dialog(), {
      api: { "lessons/exportPreview": rpcError("INTERNAL_SERVER_ERROR", 500) },
    });
    expect(await screen.findByText(COULD_NOT_LOAD)).toBeDefined();
    const button = screen.getByRole("button", {
      name: DOWNLOAD,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    logged.mockRestore();
  });

  test("text the PDF font lacks is flagged on the lesson and on the gesture, and the dialog is not 'clean'", async () => {
    await renderSite(dialog(), {
      api: {
        "lessons/exportPreview": {
          ...PREVIEW,
          issues: [
            {
              fallback: false,
              id: "g1",
              missing: false,
              name: "مرحبا",
              noDrawing: false,
              unsupportedDrawing: false,
              unsupportedText: true,
            },
          ],
          unsupportedLessonText: true,
        },
      },
    });
    expect(
      await screen.findByText(
        "The title, the notes or a part of this lesson has characters the PDF font does not have (another script or an emoji). They print as question marks."
      )
    ).toBeDefined();
    expect(
      screen.getByText(
        "Has characters the PDF cannot show: they print as question marks"
      )
    ).toBeDefined();
    expect(screen.queryByText(CLEAN)).toBeNull();
  });
});
