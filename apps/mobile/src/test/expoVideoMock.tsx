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
}

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
