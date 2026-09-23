import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPlayer } from "./VideoPlayer";

/**
 * Why the player itself is stubbed here.
 *
 * `<mux-player>` is a custom element built on `media-chrome`, and upgrading it
 * under jsdom throws before it can render: `item.part.add` is undefined
 * (jsdom has no `part` on elements) and the text-track list it subscribes to
 * has no `addEventListener`. Those throw asynchronously inside the custom
 * element reaction queue, so they arrive as *unhandled* errors that no
 * assertion can catch and that poison every later test in the run.
 *
 * So these tests pin our wrapper — which props reach the player, and the
 * skeleton, ready and error states this component owns — and they pin nothing
 * at all about Mux. That the real player upgrades and lays out is checked on
 * the kitchen-sink route, in a real browser.
 */
interface StubProps {
  playbackId?: string;
  onLoadedData?: () => void;
  onError?: () => void;
  className?: string;
  [key: string]: unknown;
}

const mockMuxProps: StubProps[] = [];

vi.mock("@mux/mux-player-react", () => ({
  default: (props: StubProps) => {
    mockMuxProps.push(props);
    return <div data-testid="mux-player" />;
  },
}));

const lastProps = (): StubProps => {
  const props = mockMuxProps.at(-1);
  if (props === undefined) {
    throw new Error("the player was never rendered");
  }
  return props;
};

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

const skeletonsIn = (container: HTMLElement): NodeListOf<Element> =>
  container.querySelectorAll(".animate-pulse");

describe("VideoPlayer", () => {
  beforeEach(() => {
    mockMuxProps.length = 0;
  });

  it("renders a player for a playback id", () => {
    render(<VideoPlayer playbackId="pb-1" title="Hallo" />);
    expect(screen.getByTestId("mux-player")).toBeDefined();
  });

  it("hands the playback id to the player", () => {
    render(<VideoPlayer playbackId="pb-1" title="Hallo" />);
    expect(lastProps().playbackId).toBe("pb-1");
  });

  it("gives the player the gesture's title as its metadata", () => {
    render(<VideoPlayer playbackId="pb-1" title="Hallo" />);
    expect(lastProps().metadata).toEqual({ video_title: "Hallo" });
  });

  it("passes a caller's own player props straight through", () => {
    render(<VideoPlayer autoPlay playbackId="pb-1" title="Hallo" />);
    expect(lastProps().autoPlay).toBe(true);
  });

  it("renders a skeleton until the video has loaded", () => {
    const { container } = render(
      <VideoPlayer playbackId="pb-1" title="Hallo" />
    );
    expect(skeletonsIn(container)).toHaveLength(1);
  });

  it("drops the skeleton once the video has loaded", () => {
    const { container } = render(
      <VideoPlayer playbackId="pb-1" title="Hallo" />
    );
    act(() => {
      lastProps().onLoadedData?.();
    });
    expect(skeletonsIn(container)).toHaveLength(0);
  });

  it("keeps the player mounted behind the skeleton, so it can load", () => {
    render(<VideoPlayer playbackId="pb-1" title="Hallo" />);
    expect(screen.getByTestId("mux-player")).toBeDefined();
    expect(skeletonsIn(document.body)).toHaveLength(1);
  });

  it("says the region is busy while the video is loading", () => {
    const { container } = render(
      <VideoPlayer playbackId="pb-1" title="Hallo" />
    );
    const region = container.firstElementChild as Element;
    expect(region.getAttribute("aria-busy")).toBe("true");
    act(() => {
      lastProps().onLoadedData?.();
    });
    expect(region.getAttribute("aria-busy")).toBeNull();
  });

  it("renders an error state and no player for a missing playback id", () => {
    render(<VideoPlayer playbackId={undefined} title="Hallo" />);
    expect(screen.queryByTestId("mux-player")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "Video niet beschikbaar"
    );
  });

  it("treats an empty playback id as a missing one", () => {
    render(<VideoPlayer playbackId="" title="Hallo" />);
    expect(screen.queryByTestId("mux-player")).toBeNull();
  });

  it("treats a null playback id as a missing one", () => {
    render(<VideoPlayer playbackId={null} title="Hallo" />);
    expect(screen.queryByTestId("mux-player")).toBeNull();
  });

  it("renders no skeleton in the error state", () => {
    const { container } = render(<VideoPlayer title="Hallo" />);
    expect(skeletonsIn(container)).toHaveLength(0);
  });

  it("lets a caller word the error", () => {
    render(<VideoPlayer errorMessage="Geen video" title="Hallo" />);
    expect(screen.getByRole("status").textContent).toContain("Geen video");
  });

  /*
   * A player that fails after it has started loading leaves the skeleton
   * pulsing for ever otherwise, which reads as "still loading" rather than
   * "broken".
   */
  it("falls back to the error state when the player reports an error", () => {
    render(<VideoPlayer playbackId="pb-1" title="Hallo" />);
    act(() => {
      lastProps().onError?.();
    });
    expect(screen.queryByTestId("mux-player")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "Video niet beschikbaar"
    );
  });

  it("still calls a caller's own onError", () => {
    const onError = vi.fn();
    render(<VideoPlayer onError={onError} playbackId="pb-1" title="Hallo" />);
    act(() => {
      lastProps().onError?.();
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("still calls a caller's own onLoadedData", () => {
    const onLoadedData = vi.fn();
    render(
      <VideoPlayer
        onLoadedData={onLoadedData}
        playbackId="pb-1"
        title="Hallo"
      />
    );
    act(() => {
      lastProps().onLoadedData?.();
    });
    expect(onLoadedData).toHaveBeenCalledTimes(1);
  });

  it("goes back to loading when the playback id changes", () => {
    const { container, rerender } = render(
      <VideoPlayer playbackId="pb-1" title="Hallo" />
    );
    act(() => {
      lastProps().onLoadedData?.();
    });
    expect(skeletonsIn(container)).toHaveLength(0);
    rerender(<VideoPlayer playbackId="pb-2" title="Dag" />);
    expect(skeletonsIn(container)).toHaveLength(1);
  });

  it("holds the video in a fixed aspect ratio, so the page does not jump", () => {
    const { container } = render(
      <VideoPlayer playbackId="pb-1" title="Hallo" />
    );
    expect(classesOf(container.firstElementChild as Element)).toContain(
      "aspect-video"
    );
  });

  it("forwards its ref to the wrapper", () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <VideoPlayer playbackId="pb-1" ref={ref} title="Hallo" />
    );
    expect(ref.current).toBe(container.firstElementChild);
  });

  it("lets className override a base class", () => {
    const { container } = render(
      <VideoPlayer className="rounded-none" playbackId="pb-1" title="Hallo" />
    );
    const classes = classesOf(container.firstElementChild as Element);
    expect(classes).toContain("rounded-none");
    expect(classes).not.toContain("rounded-lg");
  });
});
