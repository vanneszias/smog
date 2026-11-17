import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * The brand shape on both kits (DECISIONS, "Brand identity: shape"):
 * controls are pills (`rounded-pill`) and cards share one frame
 * (`rounded-card`), on the web and on native alike. A kit that drifts back to
 * a 10 px rectangle or a second card radius fails here.
 */
const PACKAGES = new URL("../../../../", import.meta.url).pathname;

function source(path: string): string {
  return readFileSync(`${PACKAGES}${path}`, "utf8");
}

const PILLS = ["components/button.tsx", "components/toggle.tsx"] as const;
const CARDS = [
  "components/card.tsx",
  "components/alert.tsx",
  "domain/gesture-card.tsx",
  "domain/share-link.tsx",
  "domain/video-player.tsx",
] as const;

describe("one shape across the kits", () => {
  test.each(PILLS)("%s is a pill on the web and native", (file) => {
    for (const kit of ["ui-web", "ui-native"]) {
      expect({
        file: `${kit}/${file}`,
        pill: source(`${kit}/src/${file}`).includes("rounded-pill"),
      }).toEqual({ file: `${kit}/${file}`, pill: true });
    }
  });

  test("fields are pills on both kits", () => {
    expect(source("ui-web/src/lib/variants.ts")).toContain("rounded-pill");
    expect(source("ui-native/src/components/input.tsx")).toContain(
      "rounded-pill"
    );
  });

  test.each(CARDS)("%s uses the one card frame on both kits", (file) => {
    for (const kit of ["ui-web", "ui-native"]) {
      expect({
        card: source(`${kit}/src/${file}`).includes("rounded-card"),
        file: `${kit}/${file}`,
      }).toEqual({ card: true, file: `${kit}/${file}` });
    }
  });

  test("no kit control borrows Tailwind's 2rem pill any more", () => {
    for (const file of [...PILLS, "lib/variants.ts", "components/tabs.tsx"]) {
      expect(source(`ui-web/src/${file}`)).not.toContain("rounded-4xl");
    }
  });
});
