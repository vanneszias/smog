import { describe, expect, mock, test } from "bun:test";
import type { MuxXhr } from "@smog/admin/client";
import type { MuxAssetItem } from "@smog/admin/schema";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useCallback, useState } from "react";
import type { VideoFieldValue } from "./video-field";

// mux-player needs a real browser.
mock.module("@mux/mux-player-react", () => ({
  default: (): ReactNode => <div data-testid="mux" />,
}));

const { renderSite } = await import("@/test/render");
const { VideoField } = await import("./video-field");

/*
 * VideoField over a fake API and a fake XHR: the upload state machine as
 * the admin sees it (progress, processing, ready, "upload another"), a
 * failed PUT with retry, the picker, the pasted playback id, and the
 * "not configured" fallback to the playback id only.
 */

class FakeXhr implements MuxXhr {
  static last: FakeXhr | null = null;
  onabort: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onload: ((event: unknown) => void) | null = null;
  status = 0;
  upload: MuxXhr["upload"] = { onprogress: null };
  url = "";
  constructor() {
    FakeXhr.last = this;
  }
  abort(): void {
    // Nothing in flight.
  }
  open(_method: string, url: string): void {
    this.url = url;
  }
  send(): void {
    // The test drives progress and the answer.
  }
  setRequestHeader(): void {
    // Not checked here (the controller test does).
  }
}

function createFakeXhr(): MuxXhr {
  return new FakeXhr();
}

const UPLOAD_URL = "https://direct.production.mux.com/upload/up-1";

function asset(
  id: string,
  overrides: Partial<MuxAssetItem> = {}
): MuxAssetItem {
  return {
    aspectRatio: "3:4",
    createdAt: Date.UTC(2026, 9, 1),
    duration: 4.4,
    id,
    playbackId: `pb-${id}`,
    status: "ready",
    usedBy: [],
    ...overrides,
  };
}

let lastValue: VideoFieldValue | null = null;

function remember(next: VideoFieldValue): void {
  lastValue = next;
}

function Harness({
  initial = null,
}: {
  initial?: VideoFieldValue | null;
}): ReactNode {
  const [value, setValue] = useState<VideoFieldValue | null>(initial);
  const onChange = useCallback((next: VideoFieldValue) => {
    remember(next);
    setValue(next);
  }, []);
  return (
    <div data-testid="page">
      <VideoField createXhr={createFakeXhr} onChange={onChange} value={value} />
    </div>
  );
}

function api(statuses: unknown[], configured = true) {
  return {
    "admin/mux/assets": {
      hasMore: false,
      items: [
        asset("a1", { usedBy: [{ id: "g1", name: "Zwaaien" }] }),
        asset("a2"),
      ],
      page: 1,
    },
    "admin/mux/createUpload": { uploadId: "up-1", url: UPLOAD_URL },
    "admin/mux/status": { configured },
    "admin/mux/uploadStatus": () =>
      statuses.length > 1 ? statuses.shift() : statuses[0],
  };
}

function chooseFile(name = "zwaaien.mp4", type = "video/mp4"): void {
  const input = screen.getByTestId("mux-file-input");
  fireEvent.change(input, {
    target: { files: [new File(["x"], name, { type })] },
  });
}

describe("VideoField", () => {
  test("uploads with progress, waits for Mux, then shows the video and sets the value", async () => {
    lastValue = null;
    const { calls } = await renderSite(() => <Harness />, {
      api: api([
        { upload: "waiting" },
        {
          asset: { id: "as-1", playbackId: "pb-new", status: "ready" },
          upload: "asset_created",
        },
      ]),
    });
    await screen.findByText("Drag a video here");
    chooseFile();
    await waitFor(() => expect(FakeXhr.last?.url).toBe(UPLOAD_URL));
    const xhr = FakeXhr.last as FakeXhr;
    const visible = await screen.findByTestId("mux-upload-progress");
    const announcer = screen.getByTestId("mux-upload-announcer");
    // The live region is never inside an aria-busy subtree.
    expect(announcer.getAttribute("role")).toBe("status");
    expect(announcer.closest('[aria-busy="true"]')).toBeNull();
    expect(visible.getAttribute("aria-live")).toBe("off");

    const progress = (loaded: number) =>
      xhr.upload.onprogress?.({ lengthComputable: true, loaded, total: 100 });
    progress(10);
    await waitFor(() =>
      expect(visible.textContent).toBe("Uploading zwaaien.mp4… 10%")
    );
    expect(announcer.textContent).toBe("Uploading zwaaien.mp4…");
    progress(30);
    await waitFor(() =>
      expect(visible.textContent).toBe("Uploading zwaaien.mp4… 30%")
    );
    expect(announcer.textContent).toBe("Uploading zwaaien.mp4… 25%");
    progress(40);
    await waitFor(() =>
      expect(visible.textContent).toBe("Uploading zwaaien.mp4… 40%")
    );
    // Between milestones the announcement does not change.
    expect(announcer.textContent).toBe("Uploading zwaaien.mp4… 25%");
    expect(
      screen.getByRole("progressbar", { name: "Uploading to Mux" })
    ).toBeDefined();
    progress(100);
    await waitFor(() =>
      expect(announcer.textContent).toBe("Uploading zwaaien.mp4… 100%")
    );
    xhr.status = 200;
    xhr.onload?.({});
    await waitFor(() =>
      expect(announcer.textContent).toBe("Mux is processing the video…")
    );
    await waitFor(
      () => expect(announcer.textContent).toBe("The video is ready."),
      { timeout: 6000 }
    );
    expect(lastValue).toEqual({
      muxAssetId: "as-1",
      playbackId: "pb-new",
    } as never);
    expect(screen.getByText("Playback ID: pb-new")).toBeDefined();
    // The ready video shows once: in the field's preview, not again in the tab.
    expect(
      screen.getAllByRole("region", { name: "Gesture video" })
    ).toHaveLength(1);
    expect(
      calls.filter((call) => call.path === "admin/mux/uploadStatus").length
    ).toBe(2);
    fireEvent.click(
      screen.getByRole("button", { name: "Upload another video" })
    );
    await screen.findByText("Drag a video here");
  }, 10_000);

  test("only a ready asset can be chosen", async () => {
    await renderSite(() => <Harness />, {
      api: {
        ...api([{ upload: "waiting" }]),
        "admin/mux/assets": {
          hasMore: false,
          items: [
            asset("ok"),
            asset("busy", { status: "preparing" }),
            asset("broken", { status: "errored" }),
          ],
          page: 1,
        },
      },
    });
    const tab = await screen.findByRole("tab", { name: "Choose existing" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    await screen.findByText("Processing");
    const buttons = screen.getAllByRole("button", { name: "Choose" });
    expect(buttons.map((button) => button.hasAttribute("disabled"))).toEqual([
      false,
      true,
      true,
    ]);
    expect(
      screen.getAllByText("Can be chosen once Mux has finished it.")
    ).toHaveLength(2);
  });

  test("a page without public assets still pages on, with no total", async () => {
    await renderSite(() => <Harness />, {
      api: {
        ...api([{ upload: "waiting" }]),
        "admin/mux/assets": (input: unknown) =>
          (input as { page?: number }).page === 2
            ? { hasMore: false, items: [asset("later")], page: 2 }
            : { hasMore: true, items: [], page: 1 },
      },
    });
    const tab = await screen.findByRole("tab", { name: "Choose existing" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    const next = await screen.findByRole("button", { name: "Next page" });
    expect(screen.queryByText("No videos in Mux yet")).toBeNull();
    expect(screen.getByText("Page 1")).toBeDefined();
    fireEvent.click(next);
    await screen.findByText("Page 2");
    expect(screen.getAllByTestId("mux-asset")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Next page" }).hasAttribute("disabled")
    ).toBe(true);
  });

  test("a failed status check is an error with a retry, not 'not configured'", async () => {
    const routes: Record<string, unknown> = api([{ upload: "waiting" }]);
    Reflect.deleteProperty(routes, "admin/mux/status");
    await renderSite(() => <Harness />, { api: routes });
    await screen.findByText("The video settings could not be loaded.");
    expect(screen.queryByText("Video uploads are not set up")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
    expect(screen.getByRole("textbox", { name: "Playback ID" })).toBeDefined();
  });

  test("refuses a file that is not a video", async () => {
    await renderSite(() => <Harness />, { api: api([{ upload: "waiting" }]) });
    await screen.findByText("Drag a video here");
    chooseFile("notes.pdf", "application/pdf");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Choose a video file."
    );
  });

  test("a refused PUT fails with retry", async () => {
    await renderSite(() => <Harness />, { api: api([{ upload: "waiting" }]) });
    await screen.findByText("Drag a video here");
    chooseFile();
    await waitFor(() => expect(FakeXhr.last?.url).toBe(UPLOAD_URL));
    const first = FakeXhr.last as FakeXhr;
    first.status = 403;
    first.onload?.({});
    await screen.findByText("The file could not be sent to Mux.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(FakeXhr.last).not.toBe(first));
  });

  test("an errored asset shows Mux's message", async () => {
    await renderSite(() => <Harness />, {
      api: api([
        {
          asset: { id: "as-1", status: "errored" },
          error: "Invalid input file",
          upload: "asset_created",
        },
      ]),
    });
    await screen.findByText("Drag a video here");
    chooseFile();
    await waitFor(() => expect(FakeXhr.last?.url).toBe(UPLOAD_URL));
    const xhr = FakeXhr.last as FakeXhr;
    xhr.status = 200;
    xhr.onload?.({});
    await screen.findByText(
      "Mux could not process this video. Try another file."
    );
    expect(screen.getByText("Invalid input file")).toBeDefined();
  });

  test("chooses an existing asset from the picker, with its usage", async () => {
    lastValue = null;
    await renderSite(() => <Harness />, { api: api([{ upload: "waiting" }]) });
    const tab = await screen.findByRole("tab", { name: "Choose existing" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    await screen.findByText("Used by 1 gesture");
    expect(screen.getByText("Not used")).toBeDefined();
    const [, second] = screen.getAllByRole("button", { name: "Choose" });
    fireEvent.click(second as HTMLElement);
    expect(lastValue).toEqual({
      muxAssetId: "a2",
      playbackId: "pb-a2",
    } as never);
    await screen.findByRole("button", { name: "Chosen" });
  });

  test("takes a pasted playback id and refuses an invalid one", async () => {
    lastValue = null;
    await renderSite(() => <Harness />, { api: api([{ upload: "waiting" }]) });
    const tab = await screen.findByRole("tab", { name: "Playback ID" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    const input = await screen.findByRole("textbox", { name: "Playback ID" });
    fireEvent.change(input, { target: { value: "not valid!" } });
    fireEvent.click(screen.getByRole("button", { name: "Use this video" }));
    await screen.findByText(
      "A playback ID consists of letters, digits, _ and -."
    );
    expect(lastValue).toBeNull();
    fireEvent.change(input, { target: { value: " abc_DEF-123 " } });
    fireEvent.click(screen.getByRole("button", { name: "Use this video" }));
    expect(lastValue).toEqual({ playbackId: "abc_DEF-123" } as never);
  });

  test("without Mux it says so and offers the playback id only", async () => {
    const { calls } = await renderSite(
      () => <Harness initial={{ playbackId: "existing-pb" }} />,
      { api: api([{ upload: "waiting" }], false) }
    );
    await screen.findByText("Video uploads are not set up");
    const upload = screen.getByRole("tab", { name: "Upload" });
    expect(upload.hasAttribute("disabled")).toBe(true);
    expect(
      screen
        .getByRole("tab", { name: "Choose existing" })
        .hasAttribute("disabled")
    ).toBe(true);
    const input = screen.getByRole("textbox", {
      name: "Playback ID",
    }) as HTMLInputElement;
    expect(input.value).toBe("existing-pb");
    expect(calls.map((call) => call.path)).toEqual(["admin/mux/status"]);
  });
});
