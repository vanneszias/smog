import { afterEach, describe, expect, mock, test } from "bun:test";
import { AuthStateProvider } from "@smog/auth/react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

const { renderSite } = await import("@/test/render");
const { GestureDrawingCard } = await import("./gesture-drawings");

/*
 * Phase 10c task 3: the drawing card of the gesture editor over a fake API:
 * invisible without a teaching role, read-only for a translator, and for a
 * teacher or an admin step 1, an optional step 2 (after step 1), the credit,
 * the upload (URL, PUT with the answered headers, finalize) and the delete.
 */

const STEP_ONE = {
  contentType: "image/png",
  credit: "© Invented Studio",
  gestureId: "g1",
  height: 80,
  path: "/api/teacher/drawings/g1/1?v=1000",
  size: 4096,
  step: 1,
  updatedAt: 1000,
  width: 120,
};

const TICKET = {
  expiresAt: 9_999_999_999_999,
  headers: { "content-type": "image/png" },
  key: "teacher/drawings/g1/1/u2",
  uploadUrl: "https://upload.example.test/put",
};

const REPLACE = /Replace drawing/;
const REMOVE = /Remove drawing/;
const CHOOSE = /Choose drawing/;
const CREDIT = /Credit/;

const original = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = original;
});

function file(name: string, type: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type });
}

function as(roles: readonly string[] | null) {
  return () => ({
    data: roles
      ? {
          user: {
            email: "t@example.test",
            id: "u1",
            name: "T",
            roles,
          },
        }
      : null,
    error: null,
    isPending: false,
  });
}

function renderCard(
  roles: readonly string[] | null,
  api: Record<string, unknown> = {}
) {
  return renderSite(
    () => (
      <div data-testid="page">
        <AuthStateProvider useSession={as(roles)}>
          <GestureDrawingCard gestureId="g1" name="Hond" />
        </AuthStateProvider>
      </div>
    ),
    { api: { "teacher/listDrawings": { items: [STEP_ONE] }, ...api } }
  );
}

function step(n: number): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-step="${n}"]`);
  if (!found) {
    throw new Error(`[test] No row for step ${n}`);
  }
  return found;
}

describe("GestureDrawingCard", () => {
  test("renders nothing, and asks for nothing, for a guest and a plain account", async () => {
    for (const roles of [null, [], ["user"]]) {
      // biome-ignore lint/performance/noAwaitInLoops: one render after the other.
      const { calls } = await renderCard(roles);
      expect(screen.queryByText("Drawings")).toBeNull();
      expect(calls.filter((call) => call.path.startsWith("teacher/"))).toEqual(
        []
      );
      document.body.innerHTML = "";
    }
  });

  test("a translator sees the drawing, its credit and size, and no way to change it", async () => {
    await renderCard(["translator"]);
    await screen.findByText("Drawings");
    const first = within(await waitFor(() => step(1)));
    const image = first.getByRole("img", { name: "Drawing of Hond, step 1" });
    expect(image.getAttribute("src")).toBe(STEP_ONE.path);
    expect(first.getByText("Credit: © Invented Studio")).toBeDefined();
    expect(first.getByText("120 × 80 px, 4 kB")).toBeDefined();
    expect(
      screen.getByText(
        "You can see the drawings. Teachers and admins change them."
      )
    ).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  test("a teacher replaces or removes step 1 and adds step 2 only after step 1", async () => {
    await renderCard(["teacher"]);
    const first = within(await waitFor(() => step(1)));
    expect(first.getByRole("button", { name: REPLACE })).toBeDefined();
    expect(first.getByRole("button", { name: REMOVE })).toBeDefined();
    expect(within(step(2)).getByRole("button", { name: CHOOSE })).toBeDefined();
    // Without step 1 there is nothing for step 2 to follow.
    document.body.innerHTML = "";
    await renderCard(["teacher"], { "teacher/listDrawings": { items: [] } });
    await waitFor(() => step(2));
    expect(within(step(2)).getByText("Add step 1 first.")).toBeDefined();
    expect(within(step(2)).queryByRole("button")).toBeNull();
    expect(within(step(1)).getByRole("button", { name: CHOOSE })).toBeDefined();
  });

  test("an admin uploads a chosen PNG: the URL, the PUT with the answered headers, then finalize with the credit", async () => {
    const put = mock(() =>
      Promise.resolve(new Response(null, { status: 200 }))
    );
    globalThis.fetch = put as unknown as typeof fetch;
    const { calls } = await renderCard(["admin"], {
      "teacher/finalizeDrawing": { ...STEP_ONE, credit: "© New" },
      "teacher/listDrawings": { items: [] },
      "teacher/uploadDrawing": TICKET,
    });
    await waitFor(() => step(1));
    const credit = within(step(1)).getByLabelText(CREDIT);
    fireEvent.change(credit, { target: { value: "  © New " } });
    fireEvent.change(screen.getByTestId("drawing-file-1"), {
      target: { files: [file("hond.png", "image/png")] },
    });
    expect(await screen.findByText("Drawing saved")).toBeDefined();
    const teacherCalls = calls.filter((call) =>
      call.path.startsWith("teacher/")
    );
    expect(teacherCalls.map((call) => call.path)).toEqual([
      "teacher/listDrawings",
      "teacher/uploadDrawing",
      "teacher/finalizeDrawing",
      "teacher/listDrawings",
    ]);
    expect(teacherCalls[1]?.input).toEqual({
      contentType: "image/png",
      gestureId: "g1",
      size: 100,
      step: 1,
    });
    expect(teacherCalls[2]?.input).toEqual({
      credit: "© New",
      gestureId: "g1",
      key: TICKET.key,
      step: 1,
    });
    const [url, init] = put.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TICKET.uploadUrl);
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "content-type": "image/png" });
  });

  test("refuses a file that is not an image or is over 1 MB before asking for a URL", async () => {
    const { calls } = await renderCard(["teacher"], {
      "teacher/listDrawings": { items: [] },
    });
    await waitFor(() => step(1));
    fireEvent.change(screen.getByTestId("drawing-file-1"), {
      target: { files: [file("notes.pdf", "application/pdf")] },
    });
    expect(
      await screen.findByText("This is not a valid PNG, JPEG or WebP image.")
    ).toBeDefined();
    fireEvent.change(screen.getByTestId("drawing-file-1"), {
      target: { files: [file("big.png", "image/png", 1_048_577)] },
    });
    expect(
      await screen.findByText("The file is larger than 1 MB.")
    ).toBeDefined();
    expect(calls.some((call) => call.path === "teacher/uploadDrawing")).toBe(
      false
    );
  });

  test("shows what the server refused: a side over 2000 px", async () => {
    await renderCard(["teacher"], {
      "teacher/listDrawings": { items: [] },
      "teacher/uploadDrawing": TICKET,
    });
    await waitFor(() => step(1));
    // The signed fallback's refusal for a side over 2,000 px.
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(null, { status: 422 }))
    ) as unknown as typeof fetch;
    fireEvent.change(screen.getByTestId("drawing-file-1"), {
      target: { files: [file("wide.png", "image/png")] },
    });
    expect(
      await screen.findByText("The image is larger than 2000 pixels on a side.")
    ).toBeDefined();
  });

  test("removes a drawing only after the confirmation", async () => {
    const { calls } = await renderCard(["teacher"], {
      "teacher/deleteDrawing": { deleted: true },
    });
    const first = within(await waitFor(() => step(1)));
    fireEvent.click(first.getByRole("button", { name: REMOVE }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Remove this drawing?")).toBeDefined();
    expect(calls.some((call) => call.path === "teacher/deleteDrawing")).toBe(
      false
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Drawing removed")).toBeDefined();
    expect(
      calls.find((call) => call.path === "teacher/deleteDrawing")?.input
    ).toEqual({ gestureId: "g1", step: 1 });
  });
});
