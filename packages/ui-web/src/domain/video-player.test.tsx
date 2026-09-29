import { beforeEach, describe, expect, mock, test } from "bun:test";
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
mock.module("@mux/mux-player-react/lazy", () => ({
  default: (props: MuxProps): ReactNode => {
    last = props;
    return <div data-testid="mux" />;
  },
}));

const { VideoPlayer } = await import("./video-player");

function tick(currentTime: number, duration = 20): void {
  act(() => {
    last.onTimeUpdate?.({ target: { currentTime, duration } });
  });
}

describe("VideoPlayer", () => {
  beforeEach(() => {
    last = {};
  });

  test("hands mux-player the playback id, a muted autoplay and the loop", () => {
    renderKit(<VideoPlayer autoPlay loop playbackId="pb-1" title="Hello" />);
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

  test("defaults: no autoplay, no loop, a 3:4 frame named by a11y.gestureVideo", () => {
    renderKit(<VideoPlayer playbackId="pb-1" />);
    expect(last.autoPlay).toBe(false);
    expect(last.loop).toBe(false);
    const frame = screen.getByRole("region", { name: "Gesture video" });
    expect(classesOf(frame)).toContain("aspect-3/4");
  });

  test("16:9", () => {
    renderKit(<VideoPlayer aspect="16:9" playbackId="pb-1" title="Hello" />);
    expect(classesOf(screen.getByRole("region", { name: "Hello" }))).toContain(
      "aspect-video"
    );
  });

  test("onNearEnd fires once per loop at 5 s or less left", () => {
    const onNearEnd = mock();
    renderKit(<VideoPlayer loop onNearEnd={onNearEnd} playbackId="pb-1" />);
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

  test("onEnded is forwarded, and re-arms onNearEnd", () => {
    const onEnded = mock();
    const onNearEnd = mock();
    renderKit(
      <VideoPlayer onEnded={onEnded} onNearEnd={onNearEnd} playbackId="pb-1" />
    );
    tick(19);
    act(() => {
      last.onEnded?.({});
    });
    expect(onEnded).toHaveBeenCalledTimes(1);
    tick(19);
    expect(onNearEnd).toHaveBeenCalledTimes(2);
  });
});
