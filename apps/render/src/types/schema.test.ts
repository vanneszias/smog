import {
  SPONSOR_NAME_MAX_LENGTH,
  SPONSORED_VIDEO_COMPOSITION_ID,
} from "@smog/types/render";
import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { RemotionRoot } from "../Root";
import { SponsoredVideoSchema } from "./schema";

describe("SponsoredVideoSchema", () => {
  it("accepts the props the site sends", () => {
    const result = SponsoredVideoSchema.safeParse({
      videoSrc: "https://example.test/a.mp4",
      sponsorName: "SMOG",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a sponsor name one character over the shared cap", () => {
    const sponsorName = "x".repeat(SPONSOR_NAME_MAX_LENGTH + 1);
    expect(sponsorName).toHaveLength(36);

    const result = SponsoredVideoSchema.safeParse({
      videoSrc: "https://example.test/a.mp4",
      sponsorName,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a videoSrc that is not a URL", () => {
    const result = SponsoredVideoSchema.safeParse({
      videoSrc: "not a url",
      sponsorName: "SMOG",
    });

    expect(result.success).toBe(false);
  });
});

describe("RemotionRoot", () => {
  it("registers the composition under the shared id", () => {
    // `RemotionRoot` uses no hooks, so calling it returns the `<Composition>`
    // element without rendering; its `id` prop is what Lambda looks up.
    const element = RemotionRoot({});

    if (!isValidElement<{ id: string }>(element)) {
      throw new Error("RemotionRoot did not return a <Composition> element");
    }
    expect(element.props.id).toBe(SPONSORED_VIDEO_COMPOSITION_ID);
  });
});
