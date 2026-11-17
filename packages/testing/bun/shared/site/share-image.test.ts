import { describe, expect, it } from "bun:test";
import {
  gestureShareImage,
  gestureThumbnails,
} from "../../../../../apps/site/src/lib/share-image";

describe("gesture share image", () => {
  it("is a landscape JPEG still at the card's size, cropped to the signer", () => {
    const image = gestureShareImage("abc123", "Alt");
    expect(image).toMatchObject({
      alt: "Alt",
      height: 630,
      type: "image/jpeg",
      width: 1200,
    });
    const url = new URL(image.url);
    expect(url.origin + url.pathname).toBe(
      "https://image.mux.com/abc123/thumbnail.jpg"
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      fit_mode: "smartcrop",
      height: "630",
      width: "1200",
    });
    // No `time`: Mux takes the middle of the video, not the first frame.
    expect(url.searchParams.has("time")).toBe(false);
  });

  it("offers 16:9, 4:3 and 1:1 thumbnails for the VideoObject", () => {
    const sizes = gestureThumbnails("abc").map((thumb) => {
      const params = new URL(thumb).searchParams;
      return `${params.get("width")}x${params.get("height")}`;
    });
    expect(sizes).toEqual(["1280x720", "1200x900", "1200x1200"]);
  });
});
