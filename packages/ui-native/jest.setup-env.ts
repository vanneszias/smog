import { jest } from "@jest/globals";

// Runs before the test framework: native modules that do not exist under
// the test renderer are swapped for their published jest mocks.
type Module = Record<string, unknown>;

jest.mock("react-native-worklets", () =>
  jest.requireActual<Module>("react-native-worklets/lib/module/mock")
);
// The published mock leaves out `useReducedMotion`; tests switch it on to
// check that the kit drops its animations.
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Module>("react-native-reanimated/mock"),
  useReducedMotion: jest.fn(() => false),
}));
jest.requireActual("react-native-gesture-handler/jestSetup");
jest.mock(
  "react-native-safe-area-context",
  () =>
    jest.requireActual<{ default: Module }>(
      "react-native-safe-area-context/jest/mock"
    ).default
);

interface SheetModalMock {
  // biome-ignore lint/style/useConsistentMethodSignatures: a class method, so the subclass can call `super.dismiss()`
  dismiss(): void;
  props: { onDismiss?: () => void };
}

// The published mock never calls `onDismiss`; the kit's sheets unmount
// their content there, so the mock's `dismiss()` reports it like the real one.
jest.mock("@gorhom/bottom-sheet", () => {
  const mock = jest.requireActual<
    Module & { BottomSheetModal: new () => SheetModalMock }
  >("@gorhom/bottom-sheet/mock");
  class BottomSheetModal extends mock.BottomSheetModal {
    override dismiss(): void {
      super.dismiss();
      this.props.onDismiss?.();
    }
  }
  return { ...mock, BottomSheetModal };
});

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Heavy: "heavy", Light: "light", Medium: "medium" },
  impactAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: {
    Error: "error",
    Success: "success",
    Warning: "warning",
  },
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

type VideoListener = (payload?: unknown) => void;

// expo-video is a native module. The mock player keeps its listeners, so a
// test can emit `timeUpdate` / `playToEnd` (`mockVideoPlayers` holds every
// player created, newest last); VideoView is a plain View.
jest.mock("expo-video", () => {
  const react = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  class MockVideoPlayer {
    currentTime = 0;
    duration = 0;
    listeners = new Map<string, Set<VideoListener>>();
    loop = false;
    muted = false;
    playing = false;
    source: unknown;
    timeUpdateEventInterval = 0;
    pause = jest.fn((): void => {
      this.playing = false;
    });
    play = jest.fn((): void => {
      this.playing = true;
    });
    constructor(source: unknown) {
      this.source = source;
    }
    addListener(
      event: string,
      listener: VideoListener
    ): { remove: () => void } {
      const set = this.listeners.get(event) ?? new Set<VideoListener>();
      set.add(listener);
      this.listeners.set(event, set);
      return { remove: () => set.delete(listener) };
    }
    emit(event: string, payload?: unknown): void {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(payload);
      }
    }
  }
  const mockVideoPlayers: MockVideoPlayer[] = [];
  return {
    mockVideoPlayers,
    useVideoPlayer: (
      source: unknown,
      setup?: (player: MockVideoPlayer) => void
    ): MockVideoPlayer => {
      const [player] = react.useState(() => {
        const created = new MockVideoPlayer(source);
        setup?.(created);
        mockVideoPlayers.push(created);
        return created;
      });
      return player;
    },
    VideoView: ({
      player: _player,
      ...props
    }: Record<string, unknown>): ReturnType<typeof react.createElement> =>
      react.createElement(View, props),
  };
});
