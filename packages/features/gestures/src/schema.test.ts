import { describe, expect, test } from "bun:test";
import { nameOverlayApplies } from "./schema";

const SPONSOR = {
  endCard: true,
  logoPath: null,
  name: "Bakkerij JAN nv",
  until: 1_900_000_000_000,
};

describe("nameOverlayApplies", () => {
  test("draws the name over a textless video, sponsored or not", () => {
    expect(nameOverlayApplies({ needsRecut: false, sponsor: null })).toBe(true);
    expect(nameOverlayApplies({ needsRecut: false, sponsor: SPONSOR })).toBe(
      true
    );
  });

  test("not while the video has the name in the picture (needs a re-cut)", () => {
    expect(nameOverlayApplies({ needsRecut: true, sponsor: null })).toBe(false);
  });

  test("not over a sponsor-rendered video, which carries the name burned in", () => {
    expect(
      nameOverlayApplies({
        needsRecut: false,
        sponsor: { ...SPONSOR, endCard: false },
      })
    ).toBe(false);
  });
});
