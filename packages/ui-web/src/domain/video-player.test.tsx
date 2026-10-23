import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createI18n } from "@smog/i18n";
import { I18nextProvider } from "@smog/i18n/react";
import { act, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { classesOf, renderKit } from "../test/render";

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
    return <div data-testid="mux" />;
  },
}));

const { VideoPlayer } = await import("./video-player");
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
    expect(overlay?.textContent).toBe("Hallo");
    // Hidden from the accessibility tree: the name is not read twice.
    expect(overlay?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getAllByText("Hallo")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Hallo" })).toBeDefined();
    // Taps reach the player's controls through it.
    expect(classesOf(overlay)).toContain("pointer-events-none");
  });

  test("the overlay is readable on any frame (a solid green pill) and fades in unless motion is reduced", async () => {
    const { container } = renderKit(
      <VideoPlayer nameOverlay="Hallo" playbackId="pb-1" />
    );
    await screen.findByTestId("mux");
    const pill = container.querySelector(
      '[data-slot="video-name-overlay"] span'
    );
    const classes = classesOf(pill);
    expect(classes).toContain("bg-sidebar");
    expect(classes).toContain("text-sidebar-foreground");
    expect(classes).toContain("animate-fade-in");
    expect(classes).toContain("motion-reduce:animate-none");
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

    test("shows only in the last seconds, timed from the duration, and hides again after a seek back", async () => {
      const { container } = renderKit(
        <VideoPlayer
          endCard={{ logoSrc: "/api/sponsor-logos/l1", name: "Bakkerij Jan" }}
          playbackId="pb-1"
        />
      );
      await screen.findByTestId("mux");
      expect(card(container)).toBeNull();
      tick(10, 20);
      expect(card(container)).toBeNull();
      tick(15.9, 20);
      expect(card(container)).toBeNull();
      tick(16, 20);
      expect(card(container)).not.toBeNull();
      tick(19.9, 20);
      expect(card(container)).not.toBeNull();
      tick(2, 20);
      expect(card(container)).toBeNull();
    });

    test("a short video shows it for its last half at most", async () => {
      const { container } = renderKit(
        <VideoPlayer endCard={{ name: "Jan" }} playbackId="pb-1" />
      );
      await screen.findByTestId("mux");
      tick(2.9, 6);
      expect(card(container)).toBeNull();
      tick(3, 6);
      expect(card(container)).not.toBeNull();
    });

    test("waits for a known duration", async () => {
      const { container } = renderKit(
        <VideoPlayer endCard={{ name: "Jan" }} playbackId="pb-1" />
      );
      await screen.findByTestId("mux");
      tick(1, Number.NaN);
      tick(5, 0);
      expect(card(container)).toBeNull();
    });

    test("says the message in the viewer's language, the name as typed, and the logo", async () => {
      const fr = renderKit(
        <VideoPlayer
          endCard={{ logoSrc: "/api/sponsor-logos/l1", name: "Bakkerij JAN nv" }}
          playbackId="pb-1"
        />,
        "fr"
      );
      await screen.findByTestId("mux");
      tick(18);
      const shown = card(fr.container);
      expect(shown?.textContent).toBe("Rendu possible grâce àBakkerij JAN nv");
      expect(shown?.getAttribute("aria-hidden")).toBe("true");
      expect(classesOf(shown)).toContain("pointer-events-none");
      expect(
        shown?.querySelector("img")?.getAttribute("src")
      ).toBe("/api/sponsor-logos/l1");
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

    test("fades in unless motion is reduced", async () => {
      const { container } = renderKit(
        <VideoPlayer endCard={{ name: "Jan" }} playbackId="pb-1" />
      );
      await screen.findByTestId("mux");
      tick(19);
      const classes = classesOf(
        card(container)?.firstElementChild ?? null
      );
      expect(classes).toContain("animate-fade-in");
      expect(classes).toContain("motion-reduce:animate-none");
      expect(classes).toContain("bg-card");
    });

    test("shows no card without an end card (no sponsor, or a rendered video)", async () => {
      const { container } = renderKit(<VideoPlayer playbackId="pb-1" />);
      await screen.findByTestId("mux");
      tick(19);
      expect(card(container)).toBeNull();
    });
  });

  test("the server render is the poster, without the player", () => {
    const html = renderToString(
      <I18nextProvider i18n={createI18n("en")}>
        <VideoPlayer playbackId="pb-1" />
      </I18nextProvider>
    );
    expect(html).toContain('data-slot="video-poster"');
    expect(html).toContain("https://image.mux.com/pb-1/thumbnail.webp");
    expect(html).not.toContain("data-testid");
    expect(last).toEqual({});
  });
});
