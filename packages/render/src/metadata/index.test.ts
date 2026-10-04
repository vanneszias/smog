/**
 * The error paths with an injected input; the real MP4 is read by the
 * render server's tests (phase 7 task 4, with the committed fixture).
 */
import { describe, expect, it } from "bun:test";
import { UnsupportedInputFormatError } from "mediabunny";
import {
  type MetadataInput,
  readSourceMetadata,
  SourceUnreadableError,
} from "./index";

interface FakeInput extends MetadataInput {
  disposed: number;
}

function fakeInput({
  duration = 4.2,
  error,
  size = { height: 1920, width: 1080 },
}: {
  duration?: number;
  error?: Error;
  size?: { height: number; width: number } | null;
}): FakeInput {
  const input: FakeInput = {
    computeDuration: () =>
      error ? Promise.reject(error) : Promise.resolve(duration),
    dispose: () => {
      input.disposed += 1;
    },
    disposed: 0,
    getPrimaryVideoTrack: () =>
      Promise.resolve(
        size
          ? {
              getDisplayHeight: () => Promise.resolve(size.height),
              getDisplayWidth: () => Promise.resolve(size.width),
            }
          : null
      ),
  };
  return input;
}

const URL_ = "https://stream.mux.com/abc/highest.mp4";

describe("readSourceMetadata", () => {
  it("answers the frames at 30 fps and the display size, then disposes", async () => {
    const input = fakeInput({ duration: 4.2 });
    const opened: string[] = [];
    const metadata = await readSourceMetadata(URL_, {
      openInput: (url) => {
        opened.push(url);
        return input;
      },
    });
    expect(opened).toEqual([URL_]);
    expect(metadata).toEqual({
      durationInFrames: 126,
      durationInSeconds: 4.2,
      height: 1920,
      width: 1080,
    });
    expect(input.disposed).toBe(1);
  });

  it("rounds the frames up, at least 1, and odd sizes down to even", async () => {
    const input = fakeInput({
      duration: 0.01,
      size: { height: 641, width: 361 },
    });
    const metadata = await readSourceMetadata(URL_, {
      openInput: () => input,
    });
    expect(metadata.durationInFrames).toBe(1);
    expect(metadata.width).toBe(360);
    expect(metadata.height).toBe(640);

    const empty = await readSourceMetadata(URL_, {
      openInput: () => fakeInput({ duration: 0 }),
    });
    expect(empty.durationInFrames).toBe(1);
  });

  it("refuses a source without a video track, and disposes", async () => {
    const input = fakeInput({ size: null });
    await expect(
      readSourceMetadata(URL_, { openInput: () => input })
    ).rejects.toBeInstanceOf(SourceUnreadableError);
    expect(input.disposed).toBe(1);
  });

  it("refuses a size under 2 px and a duration that is not finite", async () => {
    await expect(
      readSourceMetadata(URL_, {
        openInput: () => fakeInput({ size: { height: 1, width: 1080 } }),
      })
    ).rejects.toBeInstanceOf(SourceUnreadableError);
    await expect(
      readSourceMetadata(URL_, {
        openInput: () => fakeInput({ duration: Number.NaN }),
      })
    ).rejects.toBeInstanceOf(SourceUnreadableError);
  });

  it("answers an unrecognised format as unreadable, and disposes", async () => {
    const input = fakeInput({ error: new UnsupportedInputFormatError() });
    await expect(
      readSourceMetadata(URL_, { openInput: () => input })
    ).rejects.toBeInstanceOf(SourceUnreadableError);
    expect(input.disposed).toBe(1);
  });

  it("rethrows any other failure (a network fault may pass on a retry), and disposes", async () => {
    const fault = new TypeError("fetch failed");
    const input = fakeInput({ error: fault });
    await expect(
      readSourceMetadata(URL_, { openInput: () => input })
    ).rejects.toBe(fault);
    expect(input.disposed).toBe(1);
  });

  it("never puts the URL in its error (signed master URLs)", async () => {
    const signed = "https://master.mux.com/x.mp4?token=secret";
    try {
      await readSourceMetadata(signed, {
        openInput: () => fakeInput({ size: null }),
      });
      throw new Error("expected a failure");
    } catch (error) {
      expect(String((error as Error).message)).not.toContain("secret");
      expect(String((error as Error).message)).not.toContain("mux.com");
    }
  });
});
