import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

const { renderSite } = await import("../../../../../../support/site/render");
const { GestureAudio, RecutCard } = await import(
  "../../../../../../../../apps/site/src/components/admin/catalog/gesture-media"
);

/*
 * Phase 10b task 6: the admin side of a gesture's media, over a fake API:
 * one spoken-name clip per enabled language (play, replace, remove) and the
 * "video without text uploaded" action of the re-cut flag.
 */

const FRENCH_CLIP = {
  contentType: "audio/mpeg",
  durationMs: 1500,
  gestureId: "g1",
  locale: "fr",
  path: "/api/audio/g1/fr/u1",
  size: 4000,
  updatedAt: 1000,
};

const TICKET = {
  expiresAt: 9_999_999_999_999,
  headers: { "content-type": "audio/mpeg" },
  key: "audio/g1/en/u2",
  uploadUrl: "https://upload.example.test/put",
};

const REPLACE_AUDIO = /Replace audio/;
const REMOVE_AUDIO = /Remove audio/;
const CHOOSE_AUDIO = /Choose audio/;

const original = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = original;
});

function file(name: string, type: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type });
}

function row(language: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(
    `[data-language="${language}"]`
  );
  if (!found) {
    throw new Error(`[test] No audio row for ${language}`);
  }
  return found;
}

function renderAudio(api: Record<string, unknown> = {}) {
  return renderSite(
    () => (
      <div data-testid="page">
        <GestureAudio gestureId="g1" />
      </div>
    ),
    { api: { "translation/listAudio": { items: [FRENCH_CLIP] }, ...api } }
  );
}

describe("GestureAudio", () => {
  test("lists every enabled language, the default included: a clip to play and replace, or none yet", async () => {
    await renderAudio();
    await screen.findByText("Pronunciation (audio)");
    const french = within(await waitFor(() => row("fr")));
    expect(french.getByText("1.5 s")).toBeDefined();
    expect(
      french.getByRole("button", { name: "Listen to the pronunciation" })
    ).toBeDefined();
    expect(french.getByRole("button", { name: REPLACE_AUDIO })).toBeDefined();
    expect(french.getByRole("button", { name: REMOVE_AUDIO })).toBeDefined();
    for (const code of ["nl", "en"]) {
      const empty = within(row(code));
      expect(empty.getByText("No audio yet")).toBeDefined();
      expect(empty.getByRole("button", { name: CHOOSE_AUDIO })).toBeDefined();
      expect(empty.queryByRole("button", { name: REMOVE_AUDIO })).toBeNull();
      expect(
        empty.queryByRole("button", { name: "Listen to the pronunciation" })
      ).toBeNull();
    }
  });

  test("uploads a chosen MP3: the URL, the PUT with the answered headers, then finalize", async () => {
    const put = mock(() =>
      Promise.resolve(new Response(null, { status: 200 }))
    );
    globalThis.fetch = put as unknown as typeof fetch;
    const { calls } = await renderAudio({
      "translation/finalizeAudio": {
        ...FRENCH_CLIP,
        locale: "en",
        path: "/api/audio/g1/en/u2",
      },
      "translation/uploadAudio": TICKET,
    });
    await waitFor(() => row("en"));
    fireEvent.change(screen.getByTestId("audio-file-en"), {
      target: { files: [file("hello.mp3", "audio/mpeg")] },
    });
    expect(await screen.findByText("Audio saved")).toBeDefined();
    expect(
      calls
        .filter((call) => call.path.startsWith("translation/"))
        .map((call) => call.path)
    ).toEqual([
      "translation/listAudio",
      "translation/uploadAudio",
      "translation/finalizeAudio",
      "translation/listAudio",
    ]);
    const [url, init] = put.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TICKET.uploadUrl);
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "content-type": "audio/mpeg" });
  });

  test("refuses a file that is not an MP3 or M4A before uploading anything", async () => {
    const put = mock(() =>
      Promise.resolve(new Response(null, { status: 200 }))
    );
    globalThis.fetch = put as unknown as typeof fetch;
    const { calls } = await renderAudio();
    await waitFor(() => row("en"));
    fireEvent.change(screen.getByTestId("audio-file-en"), {
      target: { files: [file("voice.wav", "audio/wav")] },
    });
    expect(
      await screen.findByText("This is not a valid MP3 or M4A file.")
    ).toBeDefined();
    expect(put).not.toHaveBeenCalled();
    expect(calls.some((call) => call.path === "translation/uploadAudio")).toBe(
      false
    );
  });

  test("tells the editor why the server refused a clip (too long)", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(null, { status: 422 }))
    ) as unknown as typeof fetch;
    await renderAudio({ "translation/uploadAudio": TICKET });
    await waitFor(() => row("en"));
    fireEvent.change(screen.getByTestId("audio-file-en"), {
      target: { files: [file("long.mp3", "audio/mpeg")] },
    });
    expect(
      await screen.findByText("The clip is longer than 10 seconds.")
    ).toBeDefined();
  });

  test("removes a clip", async () => {
    const { calls } = await renderAudio({
      "translation/deleteAudio": { deleted: true },
    });
    const french = within(await waitFor(() => row("fr")));
    fireEvent.click(french.getByRole("button", { name: REMOVE_AUDIO }));
    expect(await screen.findByText("Audio removed")).toBeDefined();
    expect(
      calls.find((call) => call.path === "translation/deleteAudio")?.input
    ).toEqual({ gestureId: "g1", locale: "fr" });
  });
});

const GESTURE = {
  categories: [],
  createdAt: 1,
  description: "",
  id: "g1",
  keywords: [],
  muxAssetId: null,
  name: "Hond",
  needsRecut: true,
  playbackId: "pb",
  publishedAt: 1,
  slug: "hond",
  updatedAt: 1000,
};

describe("RecutCard", () => {
  test("says the name is still in the video and clears the flag with one click", async () => {
    const { calls } = await renderSite(
      () => (
        <div data-testid="page">
          <RecutCard gesture={GESTURE} />
        </div>
      ),
      {
        api: {
          "admin/gestures/recutDone": { ...GESTURE, needsRecut: false },
        },
      }
    );
    expect(
      await screen.findByText("The name is still in the video")
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "Video without text uploaded" })
    );
    expect(
      await screen.findByText("Marked as a video without text")
    ).toBeDefined();
    expect(
      calls.find((call) => call.path === "admin/gestures/recutDone")?.input
    ).toEqual({ id: "g1" });
    expect(
      screen.getByText("The video has no text in the picture")
    ).toBeDefined();
  });

  test("a textless video has nothing to clear", async () => {
    await renderSite(() => (
      <div data-testid="page">
        <RecutCard gesture={{ ...GESTURE, needsRecut: false }} />
      </div>
    ));
    expect(
      await screen.findByText("The video has no text in the picture")
    ).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Video without text uploaded" })
    ).toBeNull();
  });
});
