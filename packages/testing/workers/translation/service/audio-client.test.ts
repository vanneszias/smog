import { describe, expect, it, vi } from "vitest";
import {
  AudioUploadError,
  audioFileProblem,
  audioProblemOf,
  audioTypeOf,
  uploadAudioFile,
} from "../../../../features/translation/src/client/index";
import type { TranslationClient } from "../../../../features/translation/src/client/slice";
import { mp3Bytes } from "../../../support/translation/fixtures";

function file(name: string, type: string, size = 1000) {
  return Object.assign(new Blob([new Uint8Array(size)], { type }), {
    name,
  });
}

describe("audioTypeOf and audioFileProblem", () => {
  it("accepts an MP3 and an M4A by type or, without a type, by extension", () => {
    expect(audioTypeOf(file("a.mp3", "audio/mpeg"))).toBe("audio/mpeg");
    expect(audioTypeOf(file("a.m4a", "audio/x-m4a"))).toBe("audio/mp4");
    expect(audioTypeOf(file("a.m4a", "audio/mp4"))).toBe("audio/mp4");
    expect(audioTypeOf(file("a.m4a", ""))).toBe("audio/mp4");
    expect(audioTypeOf(file("a.mp3", "application/octet-stream"))).toBe(
      "audio/mpeg"
    );
  });

  it("refuses anything else and a file over 1 MiB, before any upload", () => {
    expect(audioFileProblem(file("a.wav", "audio/wav"))).toBe("format");
    expect(audioFileProblem(file("a.mp3", "image/png"))).toBe("format");
    expect(audioFileProblem(file("a.mp3", "audio/mpeg", 1_048_577))).toBe(
      "tooLarge"
    );
    expect(audioFileProblem(file("a.mp3", "audio/mpeg", 0))).toBe("tooLarge");
    expect(audioFileProblem(file("a.mp3", "audio/mpeg"))).toBeNull();
  });
});

describe("audioProblemOf", () => {
  it("maps the PUT status and the finalize refusal to one message key", () => {
    expect(audioProblemOf(new AudioUploadError(422))).toBe("duration");
    expect(audioProblemOf(new AudioUploadError(415))).toBe("format");
    expect(audioProblemOf(new AudioUploadError(413))).toBe("tooLarge");
    expect(audioProblemOf(new AudioUploadError(403))).toBe("network");
    expect(
      audioProblemOf({
        code: "VALIDATION",
        data: { fieldErrors: { file: ["duration"] }, formErrors: [] },
      })
    ).toBe("duration");
    expect(audioProblemOf(new TypeError("Failed to fetch"))).toBe("network");
    expect(audioProblemOf(new Error("boom"))).toBe("generic");
  });
});

describe("uploadAudioFile", () => {
  function client() {
    return {
      finalizeAudio: vi.fn(() =>
        Promise.resolve({
          contentType: "audio/mpeg",
          durationMs: 1000,
          gestureId: "g",
          locale: "fr",
          path: "/api/audio/g/fr/u",
          size: 5,
          updatedAt: 1,
        })
      ),
      uploadAudio: vi.fn(() =>
        Promise.resolve({
          expiresAt: 1,
          headers: { "content-type": "audio/mpeg" },
          key: "audio/g/fr/u",
          uploadUrl: "https://upload.example.test/put",
        })
      ),
    } as unknown as TranslationClient & {
      finalizeAudio: ReturnType<typeof vi.fn>;
      uploadAudio: ReturnType<typeof vi.fn>;
    };
  }

  it("asks for the URL, PUTs with exactly the answered headers, then finalizes", async () => {
    const api = client();
    const put = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 200 }))
    );
    const bytes = mp3Bytes(1);
    const blob = Object.assign(new Blob([bytes], { type: "audio/mpeg" }), {
      name: "a.mp3",
    });
    const row = await uploadAudioFile(
      api,
      { file: blob, gestureId: "g", locale: "fr" },
      put as unknown as typeof fetch
    );
    expect(row.path).toBe("/api/audio/g/fr/u");
    expect(api.uploadAudio).toHaveBeenCalledWith({
      contentType: "audio/mpeg",
      gestureId: "g",
      locale: "fr",
      size: bytes.length,
    });
    const [url, init] = put.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://upload.example.test/put");
    expect(init).toMatchObject({
      headers: { "content-type": "audio/mpeg" },
      method: "PUT",
    });
    expect(api.finalizeAudio).toHaveBeenCalledWith({
      gestureId: "g",
      key: "audio/g/fr/u",
      locale: "fr",
    });
  });

  it("does not finalize when the PUT is refused", async () => {
    const api = client();
    const put = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 415 }))
    );
    await expect(
      uploadAudioFile(
        api,
        { file: file("a.mp3", "audio/mpeg"), gestureId: "g", locale: "fr" },
        put as unknown as typeof fetch
      )
    ).rejects.toBeInstanceOf(AudioUploadError);
    expect(api.finalizeAudio).not.toHaveBeenCalled();
  });
});
