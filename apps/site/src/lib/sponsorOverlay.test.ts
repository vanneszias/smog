import { describe, expect, it } from "vitest";
import { sponsorLogo } from "./sponsorOverlay";

/*
 * Importing this module does not boot Payload. `payloadClient.ts` keeps both
 * of its imports dynamic precisely so a jsdom unit test can reach a pure rule
 * in a module that also talks to the database — see the docstring there.
 */

const IMAGE = { alt: "Logo van Acme", url: "/api/media/file/acme.png" };

const overlay = (
  overrides: Partial<Parameters<typeof sponsorLogo>[0]> = {}
) => ({
  hasLogo: true,
  overlayImage: IMAGE,
  overlayText: "Met dank aan Acme",
  sponsoredVideoPlaybackId: null,
  ...overrides,
});

describe("sponsorLogo", () => {
  it("shows the logo when the sponsor paid for one and uploaded it", () => {
    expect(sponsorLogo(overlay())).toEqual(IMAGE);
  });

  it("hides an uploaded image the sponsor did not pay to show", () => {
    // `hasLogo` is "whether the sponsor paid for a logo", not "whether a file
    // exists". A package without the logo option can still carry an image from
    // an earlier draft, and rendering it gives away something nobody was billed
    // for.
    expect(sponsorLogo(overlay({ hasLogo: false }))).toBeNull();
  });

  it("has nothing to draw when the logo was paid for but never uploaded", () => {
    expect(sponsorLogo(overlay({ overlayImage: null }))).toBeNull();
  });
});
