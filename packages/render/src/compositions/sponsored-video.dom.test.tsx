/**
 * The composition in `@remotion/player`'s `Thumbnail`, under happy-dom (no
 * Chrome; phase 7 ruling 15). happy-dom loads no font and lays nothing out,
 * so `loadFont` and `measureText` are faked. The fake measure refuses to
 * run before the fake load resolved, and refuses a validated measure of a
 * line drawn partly in a fallback font, as `validateFontIsLoaded` does.
 *
 * `remotion`'s `useDelayRender` and `useRemotionEnvironment` are spied on
 * (the composition's own calls only: Remotion's components import theirs
 * internally), so the tests see the handles and can play the renderer.
 * The tests share the memoised font loader and run in order: the failures
 * first, while the font is not loaded yet.
 */
import { describe, expect, it, mock } from "bun:test";
import type { LoadFontOptions } from "@remotion/fonts";
import type { measureText } from "@remotion/layout-utils";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RENDER_FPS, RENDER_OVERLAY_LAYOUT } from "../contract";

type Word = Parameters<typeof measureText>[0];

const remotion = await import("remotion");

const state: { fontFails: boolean; rendering: boolean } = {
  fontFails: false,
  rendering: false,
};
const loaded = new Set<string>();
const measured: Word[] = [];
const handles = { cancelled: [] as unknown[], continued: [] as number[] };
let delayed: number[] = [];
let nextHandle = 1;

/** Outside the overlay font's subsets (Latin, Cyrillic, Greek, Vietnamese). */
const UNCOVERED = /[^\u0020-\u024F\u0370-\u03FF\u0400-\u052F\u1EA0-\u1EF9]/u;
const FAILED = /^failed:/;

const DELAY_RENDER = {
  cancelRender: (error: unknown): void => {
    handles.cancelled.push(error);
  },
  continueRender: (handle: number): void => {
    handles.continued.push(handle);
  },
  delayRender: (): number => {
    const handle = nextHandle;
    nextHandle += 1;
    delayed.push(handle);
    return handle;
  },
};

mock.module("remotion", () => ({
  ...remotion,
  Html5Video: ({ src }: { src: string }) => (
    <div data-src={src} data-testid="html5-video" />
  ),
  OffthreadVideo: ({ src }: { src: string }) => (
    <div data-src={src} data-testid="offthread-video" />
  ),
  useDelayRender: () => DELAY_RENDER,
  useRemotionEnvironment: () => ({
    isClientSideRendering: false,
    isPlayer: !state.rendering,
    isReadOnlyStudio: false,
    isRendering: state.rendering,
    isStudio: false,
  }),
}));

mock.module("@remotion/fonts", () => ({
  loadFont: async (options: LoadFontOptions): Promise<void> => {
    await Promise.resolve();
    if (state.fontFails) {
      throw new Error("font offline");
    }
    loaded.add(options.url);
  },
}));

mock.module("@remotion/layout-utils", () => ({
  measureText: (word: Word): { height: number; width: number } => {
    if (loaded.size === 0) {
      throw new Error("measured before the overlay font loaded");
    }
    if (word.validateFontIsLoaded && UNCOVERED.test(word.text)) {
      throw new Error("font is not loaded (a fallback font measured)");
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
const { Background } = await import("./background");
const { OVERLAY_FONT_STACK } = await import("./font");

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

const LAST = PROPS.durationInFrames - 1;

function errorFallback({ error }: { error: Error }): React.ReactNode {
  return <p>failed: {error.message}</p>;
}

function thumbnail(
  frame: number,
  props: Partial<typeof PROPS> | { displayName: string } = {}
): React.ReactNode {
  return (
    <Thumbnail
      component={SponsoredVideo}
      compositionHeight={PROPS.height}
      compositionWidth={PROPS.width}
      durationInFrames={PROPS.durationInFrames}
      errorFallback={errorFallback}
      fps={RENDER_FPS}
      frameToDisplay={frame}
      inputProps={{ ...PROPS, ...props }}
    />
  );
}

function resetHandles(): void {
  delayed = [];
  handles.continued = [];
  handles.cancelled = [];
}

function imageWithSource(container: HTMLElement, src: string): HTMLElement {
  const image = [...container.querySelectorAll("img")].find(
    (img) => img.getAttribute("src") === src
  );
  if (!image) {
    throw new Error(`no img for ${src}`);
  }
  return image;
}

describe("SponsoredVideo in a Thumbnail", () => {
  it("in the Player, a font failure shows the error fallback, without cancelling", async () => {
    resetHandles();
    state.fontFails = true;
    const { unmount } = render(thumbnail(LAST));
    await screen.findByText("failed: the overlay font could not be loaded");
    expect(handles.cancelled).toEqual([]);
    unmount();
    expect([...handles.continued].sort()).toEqual([...delayed].sort());
  });

  it("while rendering, a font failure cancels the render", async () => {
    resetHandles();
    state.fontFails = true;
    state.rendering = true;
    const { unmount } = render(thumbnail(LAST));
    await waitFor(() => {
      expect(handles.cancelled).toHaveLength(1);
    });
    const cancelled = handles.cancelled[0] as Error;
    expect(cancelled.message).toBe("the overlay font could not be loaded");
    expect((cancelled.cause as Error).message).toBe("font offline");
    unmount();
    state.rendering = false;
    state.fontFails = false;
  });

  it("shows the intro, the name and the logo on the last frame, after the font loaded", async () => {
    resetHandles();
    const { container, unmount } = render(thumbnail(LAST));
    const intro = await screen.findByText(RENDER_OVERLAY_LAYOUT.text.intro);
    const name = screen.getByText(PROPS.displayName);
    expect(intro.style.fontFamily).toBe(OVERLAY_FONT_STACK);
    expect(name.style.fontSize).toBe(intro.style.fontSize);
    expect(intro.style.whiteSpace).toBe("nowrap");
    expect(intro.style.lineHeight).toBe("1.2");

    // The geometry reaches the component: the old router's layout at 1080 × 1920.
    const fontSize = Number.parseFloat(intro.style.fontSize);
    expect(fontSize).toBeCloseTo(0.038 * 1920, 3);
    expect(Number.parseFloat(intro.style.top)).toBeCloseTo(1670.4, 3);
    expect(Number.parseFloat(name.style.top)).toBeCloseTo(
      1670.4 + 1.5 * fontSize,
      3
    );
    const logo = imageWithSource(container, PROPS.logoUrl);
    expect(Number.parseFloat(logo.style.width)).toBeCloseTo(237.6, 3);
    expect(Number.parseFloat(logo.style.height)).toBeCloseTo(422.4, 3);
    expect(Number.parseFloat(logo.style.left)).toBeCloseTo(540 - 118.8, 3);
    expect(Number.parseFloat(logo.style.top)).toBeCloseTo(1459.2 - 211.2, 3);
    imageWithSource(container, PROPS.background.src);

    // Only the intro validates the font; the name is measured as drawn.
    expect(measured.length).toBeGreaterThan(0);
    for (const word of measured) {
      expect(word.fontFamily).toBe(OVERLAY_FONT_STACK);
      expect(word.validateFontIsLoaded).toBe(
        word.text === RENDER_OVERLAY_LAYOUT.text.intro
      );
    }
    // The frame was held while the font loaded, and released once.
    expect(delayed.length).toBeGreaterThan(0);
    expect([...handles.continued].sort()).toEqual([...delayed].sort());
    expect(handles.cancelled).toEqual([]);
    unmount();
  });

  for (const [script, displayName] of [
    ["Cyrillic, which the font covers", "Магазин Ромашка"],
    ["Arabic, which it does not", "مخبز الأمل"],
  ] as const) {
    it(`never crashes on a name in ${script}`, async () => {
      const { unmount } = render(thumbnail(LAST, { displayName }));
      await screen.findByText(displayName);
      expect(screen.queryByText(FAILED)).toBe(null);
      unmount();
    });
  }

  it("shows no overlay before its start frame", async () => {
    const { container, unmount } = render(thumbnail(0));
    await waitFor(() => {
      expect(container.querySelector("img")).not.toBe(null);
    });
    expect(screen.queryByText(RENDER_OVERLAY_LAYOUT.text.intro)).toBe(null);
    expect(screen.queryByText(PROPS.displayName)).toBe(null);
    unmount();
  });

  it("in the Player, a background image that fails shows the error fallback", async () => {
    resetHandles();
    const { container, unmount } = render(thumbnail(0));
    const image = await waitFor(() =>
      imageWithSource(container, PROPS.background.src)
    );
    // `Img` retries twice before it gives up.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      fireEvent.error(image);
    }
    await screen.findByText("failed: the background image could not be loaded");
    expect(handles.cancelled).toEqual([]);
    unmount();
  });
});

describe("Background", () => {
  const video = {
    kind: "video",
    src: "https://stream.mux.com/a/high.mp4",
  } as const;

  it("is an OffthreadVideo while rendering", () => {
    state.rendering = true;
    const { unmount } = render(<Background background={video} />);
    expect(screen.getByTestId("offthread-video").dataset.src).toBe(video.src);
    expect(screen.queryByTestId("html5-video")).toBe(null);
    unmount();
    state.rendering = false;
  });

  it("is an Html5Video in the Player", () => {
    const { unmount } = render(<Background background={video} />);
    expect(screen.getByTestId("html5-video").dataset.src).toBe(video.src);
    expect(screen.queryByTestId("offthread-video")).toBe(null);
    unmount();
  });
});
