/**
 * The error paths with an injected input; the real MP4 is read by the
 * render server's tests (phase 7 task 4, with the committed fixture).
 */
import { describe, expect, it } from "bun:test";
import { UnsupportedInputFormatError } from "mediabunny";
import {
  type MetadataInput,
  readSourceMetadata,
  SourceFetchError,
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

/** mediabunny's `UrlSource` failure (`source.js`: "Error fetching <url>: <status> <text>"). */
function mediabunnyFetchError(url: string, status: string): Error {
  return new Error(["Error fetching ", url, ": ", status].join(""));
}

const URL_ = "https://stream.mux.com/abc/highest.mp4";
const SIGNED =
  "https://master.mux.com/abc/master.mp4?skid=1&signature=s3cr3t&token=secret";

async function failureOf(url: string, input: MetadataInput): Promise<Error> {
  try {
    await readSourceMetadata(url, { openInput: () => input });
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected a failure");
}

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

  it("does not count a frame too many for a frame-exact duration", async () => {
    // 62 / 30 × 30 is 62.00000000000001 in floating point.
    const exact = await readSourceMetadata(URL_, {
      openInput: () => fakeInput({ duration: 62 / 30 }),
    });
    expect(exact.durationInFrames).toBe(62);
    const over = await readSourceMetadata(URL_, {
      openInput: () => fakeInput({ duration: 62 / 30 + 0.001 }),
    });
    expect(over.durationInFrames).toBe(63);
  });

  it("refuses a source without a video track, and disposes", async () => {
    const input = fakeInput({ size: null });
    expect(await failureOf(URL_, input)).toBeInstanceOf(SourceUnreadableError);
    expect(input.disposed).toBe(1);
  });

  it("refuses a size under 2 px and a duration that is not finite", async () => {
    expect(
      await failureOf(URL_, fakeInput({ size: { height: 1, width: 1080 } }))
    ).toBeInstanceOf(SourceUnreadableError);
    expect(
      await failureOf(URL_, fakeInput({ duration: Number.NaN }))
    ).toBeInstanceOf(SourceUnreadableError);
  });

  it("answers an unrecognised format as unreadable, and disposes", async () => {
    const input = fakeInput({ error: new UnsupportedInputFormatError() });
    expect(await failureOf(URL_, input)).toBeInstanceOf(SourceUnreadableError);
    expect(input.disposed).toBe(1);
  });

  it("wraps a fetch failure in a URL-free retryable error with the status, and disposes", async () => {
    const fault = mediabunnyFetchError(SIGNED, "403 Forbidden");
    const input = fakeInput({ error: fault });
    const failure = await failureOf(SIGNED, input);
    expect(failure).toBeInstanceOf(SourceFetchError);
    const error = failure as SourceFetchError;
    expect(error.status).toBe(403);
    expect(error.retryable).toBe(true);
    expect(error.message).toBe("the source could not be read (HTTP 403)");
    expect(error.cause).toBe(fault);
    expect(input.disposed).toBe(1);
  });

  it("wraps a network fault without a status the same way", async () => {
    const failure = await failureOf(
      URL_,
      fakeInput({ error: new TypeError(`fetch failed: ${SIGNED}`) })
    );
    expect(failure).toBeInstanceOf(SourceFetchError);
    expect((failure as SourceFetchError).status).toBe(null);
    expect(failure.message).toBe("the source could not be read");
  });

  it("never puts the URL in its error message (signed master URLs)", async () => {
    const inputs = [
      fakeInput({ error: mediabunnyFetchError(SIGNED, "404 Not Found") }),
      fakeInput({
        error: mediabunnyFetchError(SIGNED, "500 Internal Server Error"),
      }),
      fakeInput({ error: new UnsupportedInputFormatError() }),
      fakeInput({ size: null }),
    ];
    const failures = await Promise.all(
      inputs.map((input) => failureOf(SIGNED, input))
    );
    for (const failure of failures) {
      expect(failure.message).not.toContain("secret");
      expect(failure.message).not.toContain("mux.com");
    }
  });

  it("disposes the input when the signal aborts, and rejects with the abort", async () => {
    const controller = new AbortController();
    let release: (duration: number) => void = () => undefined;
    const input: FakeInput = {
      ...fakeInput({}),
      computeDuration: () =>
        new Promise<number>((resolve) => {
          release = resolve;
        }),
    };
    input.dispose = () => {
      input.disposed += 1;
    };
    const reading = readSourceMetadata(URL_, {
      openInput: () => input,
      signal: controller.signal,
    });
    controller.abort();
    expect(input.disposed).toBeGreaterThanOrEqual(1);
    release(2);
    const failure = await reading.then(
      () => null,
      (error: unknown) => error
    );
    expect(failure).toBeInstanceOf(DOMException);
    expect((failure as DOMException).name).toBe("AbortError");
  });

  it("opens nothing for a signal that has already aborted", async () => {
    const opened: string[] = [];
    const failure = await readSourceMetadata(URL_, {
      openInput: (url) => {
        opened.push(url);
        return fakeInput({});
      },
      signal: AbortSignal.abort(),
    }).then(
      () => null,
      (error: unknown) => error
    );
    expect(opened).toEqual([]);
    expect((failure as DOMException).name).toBe("AbortError");
  });

  it("reads as before with a signal that never aborts", async () => {
    const input = fakeInput({ duration: 2 });
    const metadata = await readSourceMetadata(URL_, {
      openInput: () => input,
      signal: new AbortController().signal,
    });
    expect(metadata.durationInFrames).toBe(60);
    expect(input.disposed).toBe(1);
  });
});
