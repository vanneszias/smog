import { forwardRef } from "react";
import { View, type ViewProps } from "react-native";

/**
 * The jest mock for `expo-video`, factored into its own file rather than
 * inlined in `jest.setup.ts` — same reasoning as
 * `packages/ui-native/src/test/expoVideoMock.tsx`: `nativewind/babel`
 * rewrites every React Native primitive reference (`View`) into a call
 * through a module-level helper it injects into whichever file the
 * reference appears in, and `jest.mock()`'s factory sandbox cannot see a
 * helper that landed outside its own closure. Written here, the helper is
 * local to this file, and the factory only ever `require`s the module this
 * file exports.
 */
interface ExpoVideoPlayerMock {
  loop: boolean;
  muted: boolean;
  playing: boolean;
  pause: () => void;
  play: () => void;
  addListener: (event: string, listener: Listener) => { remove: () => void };
}

type Listener = () => void;

/**
 * The most recently created mock player, tracked so `emitOnLastPlayer` (test
 * helper below) can fire an event on it without the test needing to reach
 * into `VideoPlayer`'s internals.
 */
let lastPlayer:
  | (ExpoVideoPlayerMock & { emit: (event: string) => void })
  | null = null;

export function useVideoPlayer(
  _source: unknown,
  setup?: (player: ExpoVideoPlayerMock) => void
): ExpoVideoPlayerMock {
  const listeners = new Map<string, Set<Listener>>();
  const player = {
    loop: false,
    muted: false,
    pause: () => undefined,
    play: () => undefined,
    playing: false,
    addListener: (event: string, listener: Listener) => {
      const set = listeners.get(event) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(event, set);
      return { remove: () => set.delete(listener) };
    },
    emit: (event: string) => {
      for (const listener of listeners.get(event) ?? []) {
        listener();
      }
    },
  };
  lastPlayer = player;
  setup?.(player);
  return player;
}

/** Tests only: fire an expo-video event on the most recently created player. */
export function emitOnLastPlayer(event: string): void {
  lastPlayer?.emit(event);
}

export const VideoView = forwardRef<View, ViewProps & { player?: unknown }>(
  ({ player: _player, ...props }, ref) => <View ref={ref} {...props} />
);
