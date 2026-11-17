import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { LOCALES } from "@smog/config/constants";
import sharp from "sharp";
import {
  renderShareCard,
  shareCardPlan,
} from "../../../../../apps/site/scripts/share-cards";

/** Raw RGB pixels: the committed card must equal a fresh render of the plan. */
async function pixels(png: Uint8Array): Promise<Buffer> {
  return await sharp(png).removeAlpha().raw().toBuffer();
}

describe("brand share cards (apps/site/scripts/share-cards.ts)", () => {
  const plan = shareCardPlan();

  it("has one card per shipped language", () => {
    expect(plan.map((card) => card.locale)).toEqual([...LOCALES]);
  });

  it.each(plan)(
    "og-$locale.png is the committed render, 1200 by 630, opaque",
    async ({ path, svg }) => {
      const committed = new Uint8Array(readFileSync(path));
      const info = await sharp(committed).metadata();
      expect([info.width, info.height, info.hasAlpha]).toEqual([
        1200,
        630,
        false,
      ]);
      const fresh = await renderShareCard(svg);
      expect(
        (await pixels(committed)).equals(await pixels(fresh)),
        `${path} drifted: run \`bun -F @smog/site share-cards\``
      ).toBe(true);
    },
    30_000
  );

  it("draws the text as outlines, never as <text> that needs a font", () => {
    for (const { svg } of plan) {
      expect(svg).not.toContain("<text");
    }
  });
});
