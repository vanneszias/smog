import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createI18n } from "@smog/i18n";
import { I18nextProvider } from "@smog/i18n/react";
import { act, screen } from "@testing-library/react";
import type { ReactNode, RefCallback } from "react";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

/**
 * mux-player needs a real browser (custom elements, MSE); the kit only has
 * to hand it the right props and turn its events into `onNearEnd`/`onEnded`.
 */
interface MuxProps {
  onEnded?: (event: unknown) => void;
  onTimeUpdate?: (event: unknown) => void;
  [key: string]: unknown;
}
let last: MuxProps = {};
mock.module("@mux/mux-player-react", () => ({
  default: (props: MuxProps): ReactNode => {
    last = props;
    // The real element gets its ref after it is inserted into the page.
    return (
      <div data-testid="mux" ref={props.ref as RefCallback<HTMLDivElement>} />
    );
  },
}));

const { VideoPlayer } = await import(
  "../../../../../ui-web/src/domain/video-player"
);
const { titleFontSize } = await import(
  "../../../../../ui-web/src/domain/gesture-title"
);
const { renderToString } = await import("react-dom/server");

function tick(currentTime: number, duration = 20): void {
  act(() => {
    last.onTimeUpdate?.({ target: { currentTime, duration } });
  });
}

describe("VideoPlayer", () => {
  beforeEach(() => {
    last = {};
  });

  test("hands mux-player the playback id, a muted autoplay and the loop", async () => {
    renderKit(<VideoPlayer autoPlay loop playbackId="pb-1" title="Hello" />);
    await screen.findByTestId("mux");
    expect(screen.getByTestId("mux")).toBeDefined();
    expect(last.playbackId).toBe("pb-1");
    expect(last.autoPlay).toBe("muted");
    expect(last.muted).toBe(true);
    expect(last.loop).toBe(true);
    expect(last.playsInline).toBe(true);
    // The frame is named by the title; the player does not draw it.
    expect(screen.getByRole("region", { name: "Hello" })).toBeDefined();
    expect(last.title).toBeUndefined();
    // No Mux Data beacons or cookies before analytics consent exists.
    expect(last.disableTracking).toBe(true);
    expect(last.disableCookies).toBe(true);
  });

  test("fullscreens the frame, so the name overlay and the end card stay on screen", async () => {
    renderKit(
      <VideoPlayer nameOverlay="Hond" playbackId="pb-1" title="Hello" />
    );
    await screen.findByTestId("mux");
    const frame = screen.getByRole("region", { name: "Hello" });
    expect(frame.id).not.toBe("");
    expect(last.fullscreenElement).toBe(frame.id);
    // mux-player ignores the attribute set before it is inserted: set again after.
    expect(screen.getByTestId("mux").getAttribute("fullscreen-element")).toBe(
      frame.id
    );
    // The overlay is inside the element that goes fullscreen.
    expect(frame.contains(screen.getByText("Hond"))).toBe(true);
  });

  test("a caller's id is the fullscreen element", async () => {
    renderKit(<VideoPlayer id="clip" playbackId="pb-1" title="Hello" />);
    await screen.findByTestId("mux");
    expect(last.fullscreenElement).toBe("clip");
    expect(screen.getByRole("region", { name: "Hello" }).id).toBe("clip");
  });

  test("defaults: no autoplay, no loop, a 3:4 frame named by a11y.gestureVideo", async () => {
    renderKit(<VideoPlayer playbackId="pb-1" />);
    await screen.findByTestId("mux");
    expect(last.autoPlay).toBe(false);
    expect(last.loop).toBe(false);
    const frame = screen.getByRole("region", { name: "Gesture video" });
    expect(classesOf(frame)).toContain("aspect-3/4");
  });

  test("16:9", async () => {
    renderKit(<VideoPlayer aspect="16:9" playbackId="pb-1" title="Hello" />);
    await screen.findByTestId("mux");
    expect(classesOf(screen.getByRole("region", { name: "Hello" }))).toContain(
      "aspect-video"
    );
  });

  test("onNearEnd fires once per loop at 5 s or less left", async () => {
    const onNearEnd = mock();
    renderKit(<VideoPlayer loop onNearEnd={onNearEnd} playbackId="pb-1" />);
    await screen.findByTestId("mux");
    tick(10);
    expect(onNearEnd).not.toHaveBeenCalled();
    tick(15);
    tick(16);
    tick(19.9);
    expect(onNearEnd).toHaveBeenCalledTimes(1);
    tick(0.1);
    tick(15.5);
    expect(onNearEnd).toHaveBeenCalledTimes(2);
  });

  test("onEnded is forwarded, and re-arms onNearEnd", async () => {
    const onEnded = mock();
    const onNearEnd = mock();
    renderKit(
      <VideoPlayer onEnded={onEnded} onNearEnd={onNearEnd} playbackId="pb-1" />
    );
    await screen.findByTestId("mux");
    tick(19);
    act(() => {
      last.onEnded?.({});
    });
    expect(onEnded).toHaveBeenCalledTimes(1);
    tick(19);
    expect(onNearEnd).toHaveBeenCalledTimes(2);
  });

  test("draws the name over the video as decoration: the frame's own name is the accessible one", async () => {
    const { container } = renderKit(
      <VideoPlayer nameOverlay="Hallo" playbackId="pb-1" title="Hallo" />
    );
    await screen.findByTestId("mux");
    const overlay = container.querySelector('[data-slot="video-name-overlay"]');
    expect(overlay?.textContent?.trim()).toBe("Hallo");
    // Hidden from the accessibility tree: the name is not read twice.
    expect(overlay?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getAllByText("Hallo")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Hallo" })).toBeDefined();
    // Taps reach the player's controls through it.
    expect(classesOf(overlay)).toContain("pointer-events-none");
  });

  test("the overlay is the video's own title: the pointing hand and the name, white, sized to the frame, fading in unless motion is reduced", async () => {
    const { container } = renderKit(
      <VideoPlayer nameOverlay="Hallo" playbackId="pb-1" />
    );
    await screen.findByTestId("mux");
    const overlay = container.querySelector('[data-slot="video-name-overlay"]');
    // The frame is the size container: every length follows the frame.
    expect(classesOf(overlay)).toContain("@container");
    const title = container.querySelector('[data-slot="video-name-title"]');
    const classes = classesOf(title);
    expect(classes).toContain("text-white");
    expect(classes).toContain("font-normal");
    expect(classes).toContain("top-[20.7%]");
    expect(classes).not.toContain("bg-sidebar");
    expect(classes).toContain("animate-fade-in");
    expect(classes).toContain("motion-reduce:animate-none");
    // Its size (`titleFontSize`, tested below) is a container unit the
    // test DOM does not parse.
    const hand = title?.querySelector('[data-slot="gesture-title-hand"]');
    expect(hand?.getAttribute("aria-hidden")).toBe("true");
    expect(hand?.querySelector("svg")).not.toBeNull();
  });

  test("a long name steps down so its longest word fits the frame", () => {
    expect(titleFontSize("Aap")).toBe("10.7cqw");
    expect(titleFontSize("Goedemorgen")).toBe("10.58cqw");
    expect(titleFontSize("Verkeersbord")).toBe("9.7cqw");
    // Words wrap at spaces: only the longest word has to fit one line.
    expect(titleFontSize("Tot straks")).toBe("10.7cqw");
  });

  test("shows no overlay without a name (a burned-in video, or the viewer hid it)", async () => {
    const { container } = renderKit(<VideoPlayer playbackId="pb-1" />);
    await screen.findByTestId("mux");
    expect(
      container.querySelector('[data-slot="video-name-overlay"]')
    ).toBeNull();
    const empty = renderKit(<VideoPlayer nameOverlay="" playbackId="pb-1" />);
    await screen.findAllByTestId("mux");
    expect(
      empty.container.querySelector('[data-slot="video-name-overlay"]')
    ).toBeNull();
  });

  describe("the sponsor end card", () => {
    const card = (container: HTMLElement): Element | null =>
      container.querySelector('[data-slot="sponsor-end-card"]');

    const state = (container: HTMLElement): string | undefined =>
      (card(container) as HTMLElement | null)?.dataset.state;

    test("shows only in the last seconds, timed from the duration, and leaves again after a seek back", async () => {
      const { container } = renderKit(
        <VideoPlayer
          endCard={{ logoSrc: "/api/sponsor-logos/l1", name: "Bakkerij Jan" }}
          playbackId="pb-1"
        />
      );
      await screen.findByTestId("mux");
      // Mounted from the start, hidden: it can fade out instead of vanishing.
      expect(state(container)).toBe("hidden");
      tick(10, 20);
      expect(state(container)).toBe("hidden");
      tick(15.9, 20);
      expect(state(container)).toBe("hidden");
      tick(16, 20);
      expect(state(container)).toBe("shown");
      tick(19.9, 20);
      expect(state(container)).toBe("shown");
      tick(2, 20);
      expect(state(container)).toBe("hidden");
      expect(card(container)).not.toBeNull();
    });

    test("a short video shows it for its last half at most", async () => {
      const { container } = renderKit(
        <VideoPlayer endCard={{ name: "Jan" }} playbackId="pb-1" />
      );
      await screen.findByTestId("mux");
      tick(2.9, 6);
      expect(state(container)).toBe("hidden");
      tick(3, 6);
      expect(state(container)).toBe("shown");
    });

    test("waits for a known duration", async () => {
      const { container } = renderKit(
        <VideoPlayer endCard={{ name: "Jan" }} playbackId="pb-1" />
      );
      await screen.findByTestId("mux");
      tick(1, Number.NaN);
      tick(5, 0);
      expect(state(container)).toBe("hidden");
    });

    test("says the message in the viewer's language, the name as typed, and the logo", async () => {
      const fr = renderKit(
        <VideoPlayer
          endCard={{
            logoSrc: "/api/sponsor-logos/l1",
            name: "Bakkerij JAN nv",
          }}
          playbackId="pb-1"
        />,
        "fr"
      );
      await screen.findByTestId("mux");
      tick(18);
      const shown = card(fr.container);
      expect(shown?.getAttribute("data-state")).toBe("shown");
      expect(shown?.textContent).toBe("Rendu possible grâce àBakkerij JAN nv");
      expect(shown?.getAttribute("aria-hidden")).toBe("true");
      expect(classesOf(shown)).toContain("pointer-events-none");
      expect(shown?.querySelector("img")?.getAttribute("src")).toBe(
        "/api/sponsor-logos/l1"
      );
      fr.unmount();
      const nl = renderKit(
        <VideoPlayer endCard={{ name: "Jan" }} playbackId="pb-1" />,
        "nl"
      );
      await screen.findByTestId("mux");
      tick(18);
      expect(card(nl.container)?.textContent).toBe("Mogelijk gemaakt doorJan");
      // No logo, no image.
      expect(card(nl.container)?.querySelector("img")).toBeNull();
    });

    test("part of the film: a deep green band that rises in, and fades out faster, unless motion is reduced", async () => {
      const { container } = renderKit(
        <VideoPlayer endCard={{ name: "Jan" }} playbackId="pb-1" />
      );
      await screen.findByTestId("mux");
      tick(19);
      const classes = classesOf(card(container));
      expect(classes).toContain("from-sidebar");
      expect(classes).toContain("bg-linear-to-t");
      expect(classes).not.toContain("bg-card");
      expect(classes).toContain("duration-slow");
      expect(classes).toContain("ease-enter");
      expect(classes).toContain("data-[state=hidden]:opacity-0");
      expect(classes).toContain("data-[state=hidden]:invisible");
      expect(classes).toContain("data-[state=hidden]:duration-normal");
      expect(classes).toContain("motion-reduce:transition-none");
      // Above the player's control bar.
      expect(classes).toContain("pb-16");
    });

    test("shows no card without an end card (no sponsor, or a rendered video)", async () => {
      const { container } = renderKit(<VideoPlayer playbackId="pb-1" />);
      await screen.findByTestId("mux");
      tick(19);
      expect(card(container)).toBeNull();
    });
  });

  test("the skin: no seeks, volume slider or picture-in-picture, a 1x/0.5x speed toggle, the brand's track", async () => {
    renderKit(<VideoPlayer playbackId="pb-1" />);
    await screen.findByTestId("mux");
    const style = last.style as Record<string, string>;
    expect(style["--seek-backward-button"]).toBe("none");
    expect(style["--seek-forward-button"]).toBe("none");
    expect(style["--volume-range"]).toBe("none");
    expect(style["--pip-button"]).toBe("none");
    expect(style["--media-font-family"]).toBe("var(--font-sans)");
    expect(style["--media-range-bar-color"]).toBe("var(--color-primary)");
    expect(last.playbackRates).toEqual([1, 0.5]);
  });

  test("the server render is the poster, without the player", () => {
    const html = renderToString(
      <I18nextProvider i18n={createI18n("en")}>
        <VideoPlayer playbackId="pb-1" />
      </I18nextProvider>
    );
    expect(html).toContain('data-slot="video-poster"');
    // One second in: the title and the movement, never the closing slate.
    expect(html).toContain(
      "https://image.mux.com/pb-1/thumbnail.webp?width=720&amp;time=1"
    );
    expect(html).not.toContain("data-testid");
    expect(last).toEqual({});
  });
});
