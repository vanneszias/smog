import { describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import {
  AudioButton,
  NameOverlayToggle,
} from "../../../../../ui-native/src/domain/audio-button";
import { VideoPlayer } from "../../../../../ui-native/src/domain/video-player";
import { renderKit, t } from "../../../../support/ui-native/render";

interface MockAudioPlayer {
  finish: () => void;
  pause: jest.Mock;
  play: jest.Mock;
  replace: jest.Mock;
  seekTo: jest.Mock;
  source: unknown;
}

const { mockAudioPlayers } = jest.requireMock<{
  mockAudioPlayers: MockAudioPlayer[];
}>("expo-audio");

const PLAY = t("media.audio.play");
const STOP = t("media.audio.stop");

describe("AudioButton (expo-audio)", () => {
  it("loads nothing and plays nothing until it is pressed", async () => {
    const before = mockAudioPlayers.length;
    await renderKit(<AudioButton src="https://site.test/api/audio/g/nl/u" />);
    const player = mockAudioPlayers[before];
    expect(player?.source).toBeNull();
    expect(player?.play).not.toHaveBeenCalled();
    expect(player?.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: PLAY })).toBeOnTheScreen();
  });

  it("loads the clip on the first press and stops it on the next", async () => {
    const before = mockAudioPlayers.length;
    await renderKit(<AudioButton src="https://site.test/api/audio/g/nl/u" />);
    const player = mockAudioPlayers[before];
    await act(() => {
      fireEvent.press(screen.getByRole("button", { name: PLAY }));
    });
    expect(player?.replace).toHaveBeenCalledWith({
      uri: "https://site.test/api/audio/g/nl/u",
    });
    expect(player?.play).toHaveBeenCalledTimes(1);
    await act(() => {
      fireEvent.press(screen.getByRole("button", { name: STOP }));
    });
    expect(player?.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: PLAY })).toBeOnTheScreen();
  });

  it("plays the same clip again from the start once it ended", async () => {
    const before = mockAudioPlayers.length;
    await renderKit(<AudioButton src="https://site.test/api/audio/g/nl/u" />);
    const player = mockAudioPlayers[before];
    await act(() => {
      fireEvent.press(screen.getByRole("button", { name: PLAY }));
    });
    await act(() => {
      player?.finish();
    });
    await act(() => {
      fireEvent.press(screen.getByRole("button", { name: PLAY }));
    });
    expect(player?.replace).toHaveBeenCalledTimes(1);
    expect(player?.seekTo).toHaveBeenCalledWith(0);
    expect(player?.play).toHaveBeenCalledTimes(2);
  });

  it("asks for playback with the silent switch on", async () => {
    const { mockSetAudioMode } = jest.requireMock<{
      mockSetAudioMode: jest.Mock;
    }>("expo-audio");
    const before = mockAudioPlayers.length;
    await renderKit(<AudioButton src="https://site.test/api/audio/g/nl/u" />);
    expect(mockAudioPlayers[before]).toBeDefined();
    await act(() => {
      fireEvent.press(screen.getByRole("button", { name: PLAY }));
    });
    expect(mockSetAudioMode).toHaveBeenCalledWith({ playsInSilentMode: true });
  });

  it("a clip of a screen that went away is not stopped by the next one", async () => {
    const before = mockAudioPlayers.length;
    const gone = await renderKit(
      <AudioButton src="https://site.test/api/audio/g/nl/gone" />
    );
    const released = mockAudioPlayers[before];
    await act(() => {
      fireEvent.press(screen.getByRole("button", { name: PLAY }));
    });
    // The screen unmounts: expo-audio releases the player, a later pause throws.
    await act(() => {
      gone.unmount();
    });
    released?.pause.mockImplementation(() => {
      throw new Error("released");
    });
    await renderKit(
      <AudioButton src="https://site.test/api/audio/g/nl/next" />
    );
    await act(() => {
      fireEvent.press(screen.getByRole("button", { name: PLAY }));
    });
    expect(released?.pause).not.toHaveBeenCalled();
    expect(mockAudioPlayers[before + 1]?.play).toHaveBeenCalledTimes(1);
  });

  it("plays one clip at a time", async () => {
    const before = mockAudioPlayers.length;
    await renderKit(
      <>
        <AudioButton
          accessibilityLabel="one"
          src="https://site.test/api/audio/g/nl/one"
        />
        <AudioButton
          accessibilityLabel="two"
          src="https://site.test/api/audio/g/nl/two"
        />
      </>
    );
    const [first, second] = [
      mockAudioPlayers[before],
      mockAudioPlayers[before + 1],
    ];
    await act(() => {
      fireEvent.press(screen.getByLabelText("one"));
    });
    await act(() => {
      fireEvent.press(screen.getByLabelText("two"));
    });
    expect(first?.pause).toHaveBeenCalled();
    expect(second?.play).toHaveBeenCalledTimes(1);
  });
});

describe("NameOverlayToggle", () => {
  it("is a labelled switch that reports the new state", async () => {
    const onCheckedChange = jest.fn();
    await renderKit(
      <NameOverlayToggle checked onCheckedChange={onCheckedChange} />
    );
    const toggle = screen.getByRole("switch", {
      name: t("media.nameOverlay.toggle"),
    });
    await fireEvent.press(toggle);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });
});

const HIDDEN_TOO = { includeHiddenElements: true } as const;

describe("the name over the video", () => {
  it("shows the name as decoration, hidden from the screen reader (the video's label is the name)", async () => {
    await renderKit(
      <VideoPlayer nameOverlay="Hallo" playbackId="pb-1" title="Hallo" />
    );
    const overlay = screen.getByTestId("video-name-overlay", {
      includeHiddenElements: true,
    });
    expect(overlay.props.accessibilityElementsHidden).toBe(true);
    expect(overlay.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(overlay.props.pointerEvents).toBe("none");
    // Only the video's own label is reachable: the name is not read twice.
    expect(screen.queryAllByText("Hallo")).toHaveLength(0);
    expect(screen.getByLabelText("Hallo")).toBeOnTheScreen();
  });

  it("fades in, and does not animate when the system asks for reduced motion", async () => {
    await renderKit(<VideoPlayer nameOverlay="Hallo" playbackId="pb-1" />);
    expect(
      screen.getByTestId("video-name-overlay", { includeHiddenElements: true })
        .props.entering
    ).toBeDefined();
    jest.mocked(useReducedMotion).mockReturnValue(true);
    await renderKit(<VideoPlayer nameOverlay="Hallo" playbackId="pb-1" />);
    const overlays = screen.getAllByTestId("video-name-overlay", {
      includeHiddenElements: true,
    });
    expect(overlays.at(-1)?.props.entering).toBeUndefined();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  it("is the hand pointing at the word: top left, white Figtree, sized to the frame", async () => {
    await renderKit(<VideoPlayer nameOverlay="Hond" playbackId="pb-1" />);
    const title = screen.getByTestId("gesture-title", HIDDEN_TOO);
    await fireEvent(title, "layout", {
      nativeEvent: { layout: { height: 400, width: 300 } },
    });
    // The hand starts 6 % in and is 22 % of the frame wide.
    const hand = screen.getByTestId("gesture-title-hand", HIDDEN_TOO);
    expect(hand.props.width).toBeCloseTo(66);
    const name = screen.getByText("Hond", HIDDEN_TOO);
    // 12 % of the width, Figtree Regular, white, never scaled past the frame.
    expect(name).toHaveStyle({ color: "#FFFFFF", fontSize: 36 });
    expect(name.props.allowFontScaling).toBe(false);
  });

  it("steps a long word down so it stays inside the frame", async () => {
    await renderKit(
      <VideoPlayer nameOverlay="Verjaardagstaart" playbackId="pb-1" />
    );
    await fireEvent(screen.getByTestId("gesture-title", HIDDEN_TOO), "layout", {
      nativeEvent: { layout: { height: 400, width: 300 } },
    });
    const { fontSize } = StyleSheet.flatten(
      screen.getByText("Verjaardagstaart", HIDDEN_TOO).props.style
    ) as { fontSize: number };
    // 16 characters at 0.55 em fit in 62 % of 300 pt.
    expect(fontSize).toBeCloseTo((0.62 * 300) / (16 * 0.55), 1);
    expect(fontSize).toBeLessThan(36);
  });

  it("shows no overlay without a name", async () => {
    await renderKit(<VideoPlayer playbackId="pb-1" />);
    expect(
      screen.queryByTestId("video-name-overlay", {
        includeHiddenElements: true,
      })
    ).toBeNull();
  });
});
