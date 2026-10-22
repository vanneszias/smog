import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

/**
 * Lint-style tests over the app's own sources (phase 9 ruling 3): the route
 * tests have no compiled Tailwind, so hit areas and text limits cannot be read
 * from a rendered tree there. Everything interactive goes through the kit
 * (`@smog/ui-native`, whose tests hold each component to a role, a name and
 * 44 pt); what the app builds itself is held here.
 */

// biome-ignore lint/correctness/noGlobalDirnameFilename: Jest runs this as CommonJS; `import.meta` does not exist there
const SRC_DIR = __dirname;
const MOBILE_DIR = join(SRC_DIR, "..");
const APP_DIR = join(MOBILE_DIR, "app");

const SOURCE_FILE = /\.tsx?$/;
const TEST_FILE = /\.test\.tsx?$/;
const TOUCHABLE = /Touchable(Opacity|Highlight|WithoutFeedback|NativeFeedback)/;
const PRESSABLE = /<Pressable\b/g;
const ROLE = /accessibilityRole=/;
const LABEL = /accessibilityLabel=/;
const TARGET = /min-h-touch|size-touch|hitSlop=/;
const FONT_SCALING = /allowFontScaling|maxFontSizeMultiplier/;
const LITERAL_LINES = /numberOfLines=\{\d/;
const FIXED_HEIGHT = /(?:^|[\s"'`])(?:max-h|h)-(?:\d|\[|px)|\bheight:/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      // `src/dev` is the developer gallery, not shipped to production.
      return name === "dev" || name === "test" ? [] : walk(path);
    }
    return SOURCE_FILE.test(name) && !TEST_FILE.test(name) ? [path] : [];
  });
}

const FILES = [...walk(APP_DIR), ...walk(SRC_DIR)].map((path) => ({
  path: path.replace(MOBILE_DIR, "apps/mobile"),
  text: readFileSync(path, "utf8"),
}));

/** How far past `<Pressable` its props are looked for. */
const PROPS_WINDOW = 700;

describe("the app's own touch targets", () => {
  it("builds no touchable but Pressable", () => {
    const offenders = FILES.filter(({ text }) => TOUCHABLE.test(text)).map(
      ({ path }) => path
    );
    expect(offenders).toEqual([]);
  });

  it("gives every raw Pressable a role, a label and a 44 pt target", () => {
    const problems: string[] = [];
    for (const { path, text } of FILES) {
      for (const match of text.matchAll(PRESSABLE)) {
        const props = text.slice(match.index, match.index + PROPS_WINDOW);
        const closing = props.indexOf("</Pressable");
        const opening = closing === -1 ? props : props.slice(0, closing);
        for (const [needle, what] of [
          [ROLE, "an accessibilityRole"],
          [LABEL, "an accessibilityLabel"],
          [TARGET, "a 44 pt target (min-h-touch or hitSlop)"],
        ] as const) {
          if (!needle.test(opening)) {
            problems.push(`${path}: a Pressable has no ${what}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("still has the one raw Pressable it knows (the list row's drag handle)", () => {
    const raw = FILES.filter(({ text }) => text.includes("<Pressable")).map(
      ({ path }) => path
    );
    expect(raw).toEqual(["apps/mobile/app/(tabs)/lists/[id].tsx"]);
  });
});

describe("the app's own text", () => {
  it("never switches font scaling off or caps it", () => {
    const offenders = FILES.filter(({ text }) => FONT_SCALING.test(text)).map(
      ({ path }) => path
    );
    expect(offenders).toEqual([]);
  });

  it("cuts text off only through useLineLimit (large text wraps)", () => {
    const offenders = FILES.filter(({ text }) => LITERAL_LINES.test(text)).map(
      ({ path }) => path
    );
    expect(offenders).toEqual([]);
  });

  it("sets a fixed height on a Skeleton, a WebView or nothing", () => {
    const offenders: string[] = [];
    for (const { path, text } of FILES) {
      for (const line of text.split("\n")) {
        const allowed =
          line.includes("<Skeleton") || line.includes("WEBVIEW_HEIGHT");
        if (FIXED_HEIGHT.test(line) && !allowed) {
          offenders.push(`${path}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

const HEADER_RIGHT = /\bheaderRight\b/;
/** The shadcn names replaced the aliases `surface`, `surface-raised`, `foreground-muted`, `danger` and `focus-ring`. */
const ALIAS_CLASS =
  /\b(?:bg|text|border|ring|fill|stroke)-(?:surface-raised|surface|foreground-muted|danger|focus-ring)\b(?!-)/;
const ALIAS_ROLE =
  /useColor\("(?:surface|surfaceRaised|foregroundMuted|danger|focusRing)"\)/;

describe("the app's own look (phase 10a)", () => {
  it("draws every header button on the green: through HeaderActions or a Surface", () => {
    const offenders = FILES.filter(
      ({ text }) =>
        HEADER_RIGHT.test(text) &&
        !(text.includes("<HeaderActions>") || text.includes("<Surface"))
    ).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("uses the shadcn token names, not the phase 1 to 9 aliases", () => {
    const offenders = FILES.filter(
      ({ text }) => ALIAS_CLASS.test(text) || ALIAS_ROLE.test(text)
    ).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
