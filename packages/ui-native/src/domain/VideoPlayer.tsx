import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect } from "react";
import { View, type ViewProps } from "react-native";
import { EmptyState } from "../components/EmptyState";
import { cn } from "../lib/cn";

export type VideoPlayerProps = Omit<ViewProps, "children"> & {
  /** Absent while a gesture's video is still processing, and after a delete. */
  playbackId?: string | null;
  /** The video's title, and its accessible name. */
  title: string;
  autoPlay?: boolean;
  loop?: boolean;
  className?: string;
  /** Called once each time playback reaches the end of the video. */
  onPlaybackEnd?: () => void;
};

/**
 * The public Mux HLS URL — gesture videos are created with
 * `playback_policy: ["public"]` (`apps/site/src/lib/mux.ts`), so there is no
 * signed URL to mint and no token to fetch. If that policy ever changes, this is one of the two places
 * that breaks; the other is `packages/ui-web/src/domain/VideoPlayer.tsx`,
 * which asks `@mux/mux-player-react` for the same thing.
 */
function sourceFor(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

/**
 * The native twin of `packages/ui-web/src/domain/VideoPlayer.tsx`, built on
 * `expo-video` rather than `@mux/mux-player-react`: there is no `<mux-player>`
 * custom element on a phone, and `expo-video` already speaks HLS.
 *
 * A gesture with no `playbackId` is an ordinary state in this data set — a
 * video still processing, or a gesture that never got one — not an error, so
 * it renders a labelled placeholder rather than an empty box.
 *
 * `useVideoPlayer` is created unconditionally, even for a missing
 * `playbackId`, because React's rules of hooks forbid calling it only
 * sometimes; passing it `null` and never mounting `VideoView` for that
 * render is what keeps the placeholder from ever asking the player to load
 * anything.
 */
export function VideoPlayer({
  autoPlay = false,
  className,
  loop = false,
  onPlaybackEnd,
  playbackId,
  testID = "root",
  title,
  ...props
}: VideoPlayerProps) {
  const hasVideo = playbackId != null && playbackId !== "";
  const player = useVideoPlayer(
    hasVideo ? sourceFor(playbackId) : null,
    (p) => {
      p.loop = loop;
      if (autoPlay) {
        p.play();
      }
    }
  );

  useEffect(() => {
    if (!(hasVideo && onPlaybackEnd)) {
      return;
    }

    const subscription = player.addListener("playToEnd", onPlaybackEnd);
    return () => subscription.remove();
  }, [hasVideo, onPlaybackEnd, player]);

  return (
    <View
      accessibilityLabel={title}
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-lg bg-surface",
        className
      )}
      testID={testID}
      {...props}
    >
      {hasVideo ? (
        <VideoView
          className="h-full w-full"
          nativeControls
          player={player}
          testID={`${testID}-view`}
        />
      ) : (
        <EmptyState
          className="absolute inset-0 justify-center border-0"
          testID={`${testID}-empty`}
          title="Video niet beschikbaar"
        />
      )}
    </View>
  );
}
