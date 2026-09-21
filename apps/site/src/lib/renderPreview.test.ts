import { describe, expect, it } from "vitest";
import { previewPlaybackId } from "./renderPreview";

/**
 * The Stage 5 half of the Stage 6 seam.
 *
 * These assertions are written to be *changed* by Stage 6 rather than to
 * survive it. That is the whole value of the seam: without the second test
 * below, Stage 6 could add a composed preview, forget to prefer it, and no
 * test anywhere would notice that the sponsor is still reviewing an
 * uncomposited video.
 */
describe("previewPlaybackId", () => {
  it("plays the gesture's own video", () => {
    expect(previewPlaybackId({ originalVideoPlaybackId: "pb-original" })).toBe(
      "pb-original"
    );
  });

  it("plays the original even when a composed preview exists (Stage 5 contract)", () => {
    // **This test is supposed to fail in Stage 6.** Stage 5 ships an
    // uncomposited preview on purpose — composition is Remotion and Mux,
    // which the spec orders after this stage — so a composed id in the
    // subject is a column nothing writes yet. Stage 6's job is to prefer it,
    // and changing this line is how it says so out loud.
    expect(
      previewPlaybackId({
        originalVideoPlaybackId: "pb-original",
        previewVideoPlaybackId: "pb-composed",
      })
    ).toBe("pb-original");
  });

  it("is unmoved by a null composed preview", () => {
    // `previewVideoPlaybackId` is a nullable column, so `null` is what a real
    // document carries rather than the property being absent. Both spellings
    // have to mean the same thing, or Stage 6 inherits a `??` that behaves
    // differently for a row read from the database than for the literal the
    // preview page builds.
    expect(
      previewPlaybackId({
        originalVideoPlaybackId: "pb-original",
        previewVideoPlaybackId: null,
      })
    ).toBe("pb-original");
  });
});
