import { describe, expect, it } from "bun:test";
import type { SponsoredVideoProps } from "../compositions";
import { calculateMetadata } from "./root";

describe("the Root's calculateMetadata", () => {
  it("answers the props' own size and duration", async () => {
    const props: SponsoredVideoProps = {
      background: { kind: "video", src: "https://stream.mux.com/a/high.mp4" },
      displayName: "SMOG & Co",
      durationInFrames: 61,
      height: 640,
      logoUrl: null,
      width: 360,
    };
    const metadata = await calculateMetadata({
      abortSignal: new AbortController().signal,
      compositionId: "SponsoredVideo",
      defaultProps: props,
      isRendering: false,
      props,
    });
    expect(metadata).toEqual({ durationInFrames: 61, height: 640, width: 360 });
  });
});
