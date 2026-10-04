import { beforeEach, describe, expect, test } from "bun:test";
import type { SourceMetadata } from "@smog/render/metadata";
import { renderHook, waitFor } from "@testing-library/react";
import {
  forgetSources,
  renditionUrls,
  useSourceMetadata,
} from "./use-source-metadata";

const META: SourceMetadata = {
  durationInFrames: 60,
  durationInSeconds: 2,
  height: 640,
  width: 360,
};

interface Read {
  signal: AbortSignal;
  url: string;
}

/** A reader whose answers the test gives: by URL, now or later. */
function fakeRead(answers: Record<string, SourceMetadata | Error | "hang">) {
  const reads: Read[] = [];
  const read = (url: string, signal: AbortSignal): Promise<SourceMetadata> => {
    reads.push({ signal, url });
    const answer = answers[url] ?? new Error("404");
    if (answer === "hang") {
      return new Promise(() => undefined);
    }
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer);
  };
  return { read, reads };
}

const [HIGHEST, HIGH] = renditionUrls("pb-1");

describe("useSourceMetadata (phase 7 ruling 8)", () => {
  beforeEach(() => {
    forgetSources();
  });

  test("the static renditions: highest.mp4, then high.mp4", () => {
    expect(renditionUrls("a b")).toEqual([
      "https://stream.mux.com/a%20b/highest.mp4",
      "https://stream.mux.com/a%20b/high.mp4",
    ]);
  });

  test("answers the first rendition that reads", async () => {
    const { read, reads } = fakeRead({ [HIGHEST as string]: META });
    const { result } = renderHook(() => useSourceMetadata("pb-1", read));
    expect(result.current).toEqual({ status: "loading" });
    await waitFor(() =>
      expect(result.current).toEqual({
        metadata: META,
        src: HIGHEST as string,
        status: "ready",
      })
    );
    expect(reads.map(({ url }) => url)).toEqual([HIGHEST as string]);
  });

  test("falls back to high.mp4, then fails when neither reads", async () => {
    const { read, reads } = fakeRead({ [HIGH as string]: META });
    const { result } = renderHook(() => useSourceMetadata("pb-1", read));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toMatchObject({ src: HIGH });
    expect(reads.map(({ url }) => url)).toEqual([
      HIGHEST as string,
      HIGH as string,
    ]);

    const none = fakeRead({});
    const other = renderHook(() => useSourceMetadata("pb-2", none.read));
    await waitFor(() => expect(other.result.current.status).toBe("failed"));
    expect(none.reads).toHaveLength(2);
  });

  test("is cached per playback id for the page's life, failures too", async () => {
    const first = fakeRead({ [HIGHEST as string]: META });
    const one = renderHook(() => useSourceMetadata("pb-1", first.read));
    await waitFor(() => expect(one.result.current.status).toBe("ready"));
    one.unmount();
    const again = fakeRead({});
    const two = renderHook(() => useSourceMetadata("pb-1", again.read));
    // Known at once: no loading state, no new read.
    expect(two.result.current).toMatchObject({ src: HIGHEST, status: "ready" });
    expect(again.reads).toEqual([]);

    const failing = fakeRead({});
    const three = renderHook(() => useSourceMetadata("pb-3", failing.read));
    await waitFor(() => expect(three.result.current.status).toBe("failed"));
    three.unmount();
    const four = renderHook(() => useSourceMetadata("pb-3", failing.read));
    expect(four.result.current.status).toBe("failed");
    expect(failing.reads).toHaveLength(2);
  });

  test("an unmount aborts the read in flight, and caches nothing", async () => {
    const { read, reads } = fakeRead({ [HIGHEST as string]: "hang" });
    const { unmount } = renderHook(() => useSourceMetadata("pb-1", read));
    await waitFor(() => expect(reads).toHaveLength(1));
    expect(reads[0]?.signal.aborted).toBe(false);
    unmount();
    expect(reads[0]?.signal.aborted).toBe(true);
    const later = fakeRead({ [HIGHEST as string]: META });
    const { result } = renderHook(() => useSourceMetadata("pb-1", later.read));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  test("a new playback id aborts the old read and reads the new one", async () => {
    const { read, reads } = fakeRead({
      [HIGHEST as string]: "hang",
      [renditionUrls("pb-9")[0] as string]: META,
    });
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useSourceMetadata(id, read),
      { initialProps: { id: "pb-1" } }
    );
    await waitFor(() => expect(reads).toHaveLength(1));
    rerender({ id: "pb-9" });
    expect(reads[0]?.signal.aborted).toBe(true);
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toMatchObject({ src: renditionUrls("pb-9")[0] });
  });
});
