import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { tokens } from "@smog/styles/tokens";
import { HEADING_MAX_FONT_SCALE } from "../../../../ui-native/src/lib/heading-scale";

/**
 * Lint-style tests over the kit's sources, for what a rendered tree cannot
 * show under Jest: dynamic type and motion (phase 9 ruling 3). The kit is
 * `src/components` and `src/domain`.
 */

// biome-ignore lint/correctness/noGlobalDirnameFilename: Jest runs this as CommonJS; `import.meta` does not exist there
const ROOT = join(__dirname, "../../../../ui-native/src");

const TSX = /\.tsx$/;
const TEST_TSX = /\.test\.tsx$/;
const FIXED_HEIGHT = /(?:^|[\s"'`])(?:max-h|h)-(?:\d|\[|px)|\bheight:/;
const FONT_SCALING = /allowFontScaling|maxFontSizeMultiplier/;
const LITERAL_LINES = /numberOfLines=\{\d/;
const ANIMATES =
  /animate-|withTiming|withSpring|withRepeat|entering=|exiting=|LayoutAnimation|<Animated\./;

function sources(): { file: string; text: string }[] {
  return ["components", "domain"].flatMap((dir) =>
    readdirSync(join(ROOT, dir))
      .filter((name) => TSX.test(name) && !TEST_TSX.test(name))
      .map((name) => ({
        file: `${dir}/${name}`,
        text: readFileSync(join(ROOT, dir, name), "utf8"),
      }))
  );
}

/**
 * Fixed heights in the kit, with why none of them holds text. A fixed height
 * on a text container clips it at a large font size; a placeholder, a rule or
 * an image does not.
 */
const FIXED_HEIGHT_ALLOWED: Record<string, string> = {
  "components/error-state.tsx": "the disc behind the hand: no text",
  "components/hand-illustration.tsx": "an image: the hand's own size",
  "components/logo.tsx": "an image: the logo's own size",
  "components/menu.tsx": "a hairline separator",
  "components/progress-bar.tsx": "the track and its fill: no text",
  "components/separator.tsx": "a hairline: no text",
  "components/sheet-panel.tsx": "the drag handle: no text",
  "components/skeleton.tsx": "a placeholder: no text",
  "components/stepper.tsx": "the connector line between steps: no text",
  "domain/gesture-parts.tsx": "the play disc on a still: no text",
  "domain/gesture-row.tsx": "the thumbnail: an image",
  "domain/sponsor-end-card.tsx": "the logo: an image, the text beside it wraps",
  "domain/video-player.tsx": "the video fills its aspect-ratio box",
};

describe("dynamic type", () => {
  it("has no fixed height outside the files that hold no text", () => {
    const offenders = sources()
      .filter(({ file }) => !(file in FIXED_HEIGHT_ALLOWED))
      .filter(({ text }) => FIXED_HEIGHT.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("keeps the allowed list honest: each file still has a fixed height", () => {
    const present = new Set(
      sources()
        .filter(({ text }) => FIXED_HEIGHT.test(text))
        .map(({ file }) => file)
    );
    expect(
      Object.keys(FIXED_HEIGHT_ALLOWED).filter((file) => !present.has(file))
    ).toEqual([]);
  });

  it("never switches font scaling off, and limits it only on headings", () => {
    // `Heading` applies `lib/heading-scale.ts`; nothing else may.
    const offenders = sources()
      .filter(({ file }) => file !== "components/text.tsx")
      .filter(({ text }) => FONT_SCALING.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
    const heading = sources().find(
      ({ file }) => file === "components/text.tsx"
    );
    expect(heading?.text).not.toContain("allowFontScaling");
  });

  it("lets a heading grow to at least twice its size (WCAG 1.4.4), the largest least", () => {
    expect(Object.keys(HEADING_MAX_FONT_SCALE).sort()).toEqual([
      "display",
      "title-1",
      "title-2",
    ]);
    for (const limit of Object.values(HEADING_MAX_FONT_SCALE)) {
      expect(limit).toBeGreaterThanOrEqual(2);
    }
    const { fontSize } = tokens;
    // At the limit the steps keep their order, above the body text at iOS's
    // largest accessibility size (a font scale of about 3.1).
    const largest = (step: keyof typeof HEADING_MAX_FONT_SCALE): number =>
      fontSize[step].size * HEADING_MAX_FONT_SCALE[step];
    expect(largest("display")).toBeGreaterThan(largest("title-1"));
    expect(largest("title-1")).toBeGreaterThan(largest("title-2"));
    expect(largest("title-2")).toBeGreaterThan(fontSize["title-3"].size * 3.1);
    expect(fontSize["title-3"].size * 3.1).toBeGreaterThan(
      fontSize.body.size * 3.1
    );
  });

  it("cuts text off only through useLineLimit (large text wraps)", () => {
    const offenders = sources()
      // A Textarea's `rows` is its height, not a cut-off.
      .filter(({ file }) => file !== "components/textarea.tsx")
      .filter(({ text }) => LITERAL_LINES.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});

describe("reduced motion", () => {
  it("every file that animates asks useReducedMotion", () => {
    const offenders = sources()
      .filter(({ text }) => ANIMATES.test(text))
      .filter(({ text }) => !text.includes("useReducedMotion"))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("covers what animates today", () => {
    const animating = sources()
      .filter(({ text }) => text.includes("useReducedMotion"))
      .map(({ file }) => file)
      .sort();
    expect(animating).toEqual([
      "components/dialog.tsx",
      "components/popover.tsx",
      "components/progress-bar.tsx",
      "components/sheet-panel.tsx",
      "components/skeleton.tsx",
      "components/toast.tsx",
      "domain/favorite-button.tsx",
      "domain/sponsor-end-card.tsx",
      "domain/video-player.tsx",
    ]);
  });
});
