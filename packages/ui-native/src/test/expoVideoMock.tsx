import { forwardRef } from "react";
import { View, type ViewProps } from "react-native";

/**
 * The jest mock for `expo-video`, factored into its own file rather than
 * inlined in `jest.setup.ts`.
 *
 * `jest.mock()`'s factory runs in a sandboxed scope that may reference only
 * a fixed allowlist (`require`, `jest`, …) plus anything it requires fresh —
 * and this package's `nativewind/babel` preset rewrites every reference to a
 * React Native primitive like `View` into a call through a module-level
 * `_ReactNativeCSSInterop` helper it injects at the top of *whichever file
 * the reference appears in*. Written inline in `jest.setup.ts`, that helper
 * lands outside the factory closure and the sandbox rejects the reference.
 * Written here instead, the helper is local to this file's own closure, and
 * the factory only ever calls the plain `require(...)` this file returns.
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

/**
 * Named `useVideoPlayer`/`VideoView`, matching `expo-video`'s own exports
 * exactly: `jest.setup.ts` returns this whole module as the mock, so its
 * shape has to be the shape callers of `expo-video` expect.
 */
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
