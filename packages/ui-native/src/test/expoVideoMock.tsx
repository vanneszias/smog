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
}

/**
 * Named `useVideoPlayer`/`VideoView`, matching `expo-video`'s own exports
 * exactly: `jest.setup.ts` returns this whole module as the mock, so its
 * shape has to be the shape callers of `expo-video` expect.
 */
export function useVideoPlayer(
  _source: unknown,
  setup?: (player: ExpoVideoPlayerMock) => void
): ExpoVideoPlayerMock {
  const player: ExpoVideoPlayerMock = {
    loop: false,
    muted: false,
    pause: () => undefined,
    play: () => undefined,
    playing: false,
  };
  setup?.(player);
  return player;
}

export const VideoView = forwardRef<View, ViewProps & { player?: unknown }>(
  ({ player: _player, ...props }, ref) => <View ref={ref} {...props} />
);
