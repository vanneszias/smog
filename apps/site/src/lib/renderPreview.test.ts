import { describe, expect, it } from "vitest";
import { previewPlaybackId } from "./renderPreview";

/**
 * **Which video the review step plays, and why that is a seam.**
 *
 * The preview once played the uncomposited original on purpose, before
 * composition existed. The middle test below used to assert that a composed
 * preview was *ignored*, and its comment said in as many words that
 * preferring it would be done by changing that line. It has been.
 *
 * What the seam was worth: without it, the callback could have written
 * `previewVideoPlaybackId`, nothing would have preferred it here, and no test
 * anywhere would have noticed that the sponsor was still reviewing a video
 * with no logo on it.
 */
describe("previewPlaybackId", () => {
  it("plays the gesture's own video when nothing has been composed", () => {
    expect(previewPlaybackId({ originalVideoPlaybackId: "pb-original" })).toBe(
      "pb-original"
    );
  });

  it("previewPlaybackId returns the composed video once there is one", () => {
    // The composed contract. `POST /api/render/callback` writes
    // `previewVideoPlaybackId` when Remotion Lambda's composite reaches Mux,
    // and the review step is the whole reason it exists: the sponsor approves
    // the video that will run, logo burned in, rather than an approximation of
    // it drawn in HTML.
    expect(
      previewPlaybackId({
        originalVideoPlaybackId: "pb-original",
        previewVideoPlaybackId: "pb-composed",
      })
    ).toBe("pb-composed");
  });

  it("falls back to the original while the render is still running", () => {
    // The original contract, deliberately kept: a render takes minutes, and a
    // sponsor who reloads the preview page in that window must see the video
    // they are sponsoring rather than an error or an empty player.
    //
    // `null` and the absent property both have to mean it.
    // `previewVideoPlaybackId` is a nullable column, so `null` is what a row
    // read from the database carries, while the preview page builds a literal
    // from the gesture it resolved and simply leaves the property off. A `??`
    // that treated the two differently would give the page and the row
    // different answers.
    expect(
      previewPlaybackId({
        originalVideoPlaybackId: "pb-original",
        previewVideoPlaybackId: null,
      })
    ).toBe("pb-original");
    expect(previewPlaybackId({ originalVideoPlaybackId: "pb-original" })).toBe(
      "pb-original"
    );
  });

  it("falls back to the original for a composed id that is empty", () => {
    // `??` alone would return `""` here and the player would be handed an
    // empty playback id, which is a broken video rather than the original one.
    // A text column in this database holds `""` as readily as it holds NULL:
    // `endpoints/sponsorships.ts` writes `contactCompany: ""` as `null` by
    // hand precisely because nothing stops the empty string otherwise.
    expect(
      previewPlaybackId({
        originalVideoPlaybackId: "pb-original",
        previewVideoPlaybackId: "",
      })
    ).toBe("pb-original");
  });
});
