import { describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { Linking, StyleSheet } from "react-native";
import { renderKit, t } from "../test/render";
import { COURSE_MESSAGE_COUNT, CourseBanner } from "./course-banner";
import { VideoPlayer } from "./video-player";

interface MockPlayer {
  currentTime: number;
  duration: number;
  emit: (event: string, payload?: unknown) => void;
  loop: boolean;
  muted: boolean;
  pause: jest.Mock;
  play: jest.Mock;
  source: unknown;
}

const { mockVideoPlayers } = jest.requireMock<{
  mockVideoPlayers: MockPlayer[];
}>("expo-video");

function latest(): MockPlayer {
  const player = mockVideoPlayers.at(-1);
  if (!player) {
    throw new Error("No player was created");
  }
  return player;
}

async function tick(player: MockPlayer, currentTime: number): Promise<void> {
  await act(() => {
    player.emit("timeUpdate", { currentTime });
  });
}

describe("VideoPlayer", () => {
  it("plays the Mux HLS stream, muted and looping when asked", async () => {
    await renderKit(
      <VideoPlayer autoPlay loop playbackId="pb-1" title="Hello" />
    );
    const player = latest();
    expect(player.source).toBe("https://stream.mux.com/pb-1.m3u8");
    expect(player.loop).toBe(true);
    expect(player.muted).toBe(true);
    expect(player.play).toHaveBeenCalled();
    const view = screen.getByLabelText("Hello");
    expect(StyleSheet.flatten(view.props.style)).toMatchObject({
      aspectRatio: 0.75,
    });
  });

  it("defaults: no autoplay, 3:4, named by a11y.gestureVideo; 16:9", async () => {
    const { rerender } = await renderKit(<VideoPlayer playbackId="pb-1" />);
    expect(latest().play).not.toHaveBeenCalled();
    expect(screen.getByLabelText(t("a11y.gestureVideo"))).toBeOnTheScreen();
    await rerender(<VideoPlayer aspect="16:9" playbackId="pb-1" />);
    expect(
      StyleSheet.flatten(
        screen.getByLabelText(t("a11y.gestureVideo")).props.style
      )
    ).toMatchObject({ aspectRatio: 16 / 9 });
  });

  it("onNearEnd fires once per loop at 5 s or less left", async () => {
    const onNearEnd = jest.fn();
    await renderKit(
      <VideoPlayer loop onNearEnd={onNearEnd} playbackId="pb-1" />
    );
    const player = latest();
    player.duration = 20;
    await tick(player, 10);
    await tick(player, 15);
    await tick(player, 18);
    expect(onNearEnd).toHaveBeenCalledTimes(1);
    await tick(player, 0.2);
    await tick(player, 16);
    expect(onNearEnd).toHaveBeenCalledTimes(2);
  });

  it("onEnded on playToEnd", async () => {
    const onEnded = jest.fn();
    await renderKit(<VideoPlayer onEnded={onEnded} playbackId="pb-1" />);
    await act(() => {
      latest().emit("playToEnd");
    });
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("pauses on blur and resumes an autoplaying video on focus", async () => {
    const { rerender } = await renderKit(
      <VideoPlayer autoPlay isFocused playbackId="pb-1" />
    );
    const player = latest();
    await rerender(
      <VideoPlayer autoPlay isFocused={false} playbackId="pb-1" />
    );
    expect(player.pause).toHaveBeenCalled();
    player.play.mockClear();
    await rerender(<VideoPlayer autoPlay isFocused playbackId="pb-1" />);
    expect(player.play).toHaveBeenCalledTimes(1);
  });
});

describe("CourseBanner", () => {
  const COURSE_URL = "https://smog.vlaanderen/volg-een-cursus";

  it("links the localized phrase to the course", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await renderKit(<CourseBanner courseUrl={COURSE_URL} messageIndex={2} />);
    expect(screen.getByText(t("gesture.disclaimer.title"))).toBeOnTheScreen();
    const link = screen.getByRole("link", { name: "click here" });
    await fireEvent.press(link);
    expect(open).toHaveBeenCalledWith(COURSE_URL);
  });

  it("messages without a phrase have no link; all 7 render", async () => {
    expect(COURSE_MESSAGE_COUNT).toBe(7);
    await renderKit(<CourseBanner courseUrl={COURSE_URL} messageIndex={4} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.getByText("The gestures are protected. Don't invent others.")
    ).toBeOnTheScreen();
  });

  it("onDismiss adds a close button", async () => {
    const onDismiss = jest.fn();
    await renderKit(
      <CourseBanner
        courseUrl={COURSE_URL}
        messageIndex={1}
        onDismiss={onDismiss}
      />
    );
    await fireEvent.press(
      screen.getByRole("button", { name: t("a11y.close") })
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
