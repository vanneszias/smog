/**
 * The composition in `@remotion/player`'s `Thumbnail`, under happy-dom (no
 * Chrome; phase 7 ruling 15). happy-dom loads no font and lays nothing out,
 * so `loadFont` and `measureText` are faked: the fake measure refuses to run
 * before the fake load resolved, as `validateFontIsLoaded` would.
 */
import { describe, expect, it, mock } from "bun:test";
import type { LoadFontOptions } from "@remotion/fonts";
import type { measureText } from "@remotion/layout-utils";
import { render, screen, waitFor } from "@testing-library/react";
import { RENDER_FPS, RENDER_OVERLAY_LAYOUT } from "../contract";

const loaded = new Set<string>();
type Word = Parameters<typeof measureText>[0];

const measured: Word[] = [];

mock.module("@remotion/fonts", () => ({
  loadFont: async (options: LoadFontOptions): Promise<void> => {
    await Promise.resolve();
    loaded.add(options.url);
  },
}));

mock.module("@remotion/layout-utils", () => ({
  measureText: (word: Word): { height: number; width: number } => {
    if (loaded.size < 2 || word.validateFontIsLoaded !== true) {
      throw new Error("measured before the overlay font loaded");
    }
    measured.push(word);
    return {
      height: Number(word.fontSize) * 1.2,
      width: word.text.length * 0.5 * Number(word.fontSize),
    };
  },
}));

const { Thumbnail } = await import("@remotion/player");
const { SponsoredVideo } = await import("./sponsored-video");
const { OVERLAY_FONT_FAMILY } = await import("./font");

const PROPS = {
  background: {
    kind: "image",
    src: "https://image.mux.com/abc/thumbnail.webp",
  },
  displayName: "SMOG & Co",
  durationInFrames: 10 * RENDER_FPS,
  height: 1920,
  logoUrl: "https://example.test/logo.png",
  width: 1080,
} as const;

function thumbnail(frame: number): React.ReactNode {
  return (
    <Thumbnail
      component={SponsoredVideo}
      compositionHeight={PROPS.height}
      compositionWidth={PROPS.width}
      durationInFrames={PROPS.durationInFrames}
      fps={RENDER_FPS}
      frameToDisplay={frame}
      inputProps={PROPS}
    />
  );
}

describe("SponsoredVideo in a Thumbnail", () => {
  it("shows the intro, the name and the logo on the last frame, after the font loaded", async () => {
    const { container } = render(thumbnail(PROPS.durationInFrames - 1));
    const intro = await waitFor(() =>
      screen.getByText(RENDER_OVERLAY_LAYOUT.text.intro)
    );
    const name = screen.getByText(PROPS.displayName);
    expect(intro.style.fontFamily).toContain(OVERLAY_FONT_FAMILY);
    expect(name.style.fontSize).toBe(intro.style.fontSize);
    expect(intro.style.whiteSpace).toBe("nowrap");
    expect(intro.style.lineHeight).toBe("1.2");

    const sources = [...container.querySelectorAll("img")].map((img) =>
      img.getAttribute("src")
    );
    expect(sources).toContain(PROPS.logoUrl);
    expect(sources).toContain(PROPS.background.src);
    expect(measured.length).toBeGreaterThan(0);
    expect(
      measured.every((word) => word.fontFamily === OVERLAY_FONT_FAMILY)
    ).toBe(true);
  });

  it("shows no overlay before its start frame", async () => {
    const { container } = render(thumbnail(0));
    await waitFor(() => {
      expect(container.querySelector("img")).not.toBe(null);
    });
    expect(screen.queryByText(RENDER_OVERLAY_LAYOUT.text.intro)).toBe(null);
    expect(screen.queryByText(PROPS.displayName)).toBe(null);
  });
});
