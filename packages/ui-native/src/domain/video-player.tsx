import { useTranslation } from "@smog/i18n/react";
import { createNearEndTracker, muxStreamUrl } from "@smog/utils";
import { useVideoPlayer, VideoView } from "expo-video";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";

export type VideoAspect = "3:4" | "16:9";

export interface VideoPlayerProps extends Omit<ViewProps, "children"> {
  /** 3:4 for gesture videos (default), 16:9 for others. */
  aspect?: VideoAspect;
  /** Starts playing on its own, muted (as web, where browsers require it). */
  autoPlay?: boolean;
  className?: string;
  /**
   * Whether the screen is focused (`useIsFocused()`): the video pauses on
   * blur and an autoplaying one resumes on focus. Defaults to focused.
   */
  isFocused?: boolean;
  loop?: boolean;
  /**
   * On expo-video's `playToEnd`. Whether it fires on every loop is up to the
   * platform player (not verified on a device); `onNearEnd` fires every loop.
   */
  onEnded?: () => void;
  /** Once per playthrough, when 5 s or less are left (the CourseBanner cue). */
  onNearEnd?: () => void;
  playbackId: string;
  /** Names the video (the gesture's name; `a11y.gestureVideo` by default). */
  title?: string;
}

const ASPECT = {
  "3:4": { aspectRatio: 3 / 4 },
  "16:9": { aspectRatio: 16 / 9 },
} as const;

/** Seconds between `timeUpdate` events (enough for the 5 s cue). */
const TIME_UPDATE_INTERVAL = 0.25;

/** The gesture video: expo-video on the Mux HLS stream, with native controls. */
export function VideoPlayer({
  aspect = "3:4",
  autoPlay = false,
  className,
  isFocused = true,
  loop = false,
  onEnded,
  onNearEnd,
  playbackId,
  style,
  title,
  ...props
}: VideoPlayerProps): ReactElement {
  const { t } = useTranslation();
  const [tracker] = useState(createNearEndTracker);
  const onNearEndRef = useRef(onNearEnd);
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onNearEndRef.current = onNearEnd;
    onEndedRef.current = onEnded;
  }, [onEnded, onNearEnd]);

  const player = useVideoPlayer(muxStreamUrl(playbackId), (created) => {
    created.loop = loop;
    created.muted = autoPlay;
    created.timeUpdateEventInterval = TIME_UPDATE_INTERVAL;
    if (autoPlay && isFocused) {
      created.play();
    }
  });

  useEffect(() => {
    player.loop = loop;
  }, [loop, player]);

  // Pause on blur; resume an autoplaying video when the screen is back.
  const wasFocused = useRef(isFocused);
  useEffect(() => {
    if (wasFocused.current === isFocused) {
      return;
    }
    wasFocused.current = isFocused;
    if (!isFocused) {
      player.pause();
    } else if (autoPlay) {
      player.play();
    }
  }, [autoPlay, isFocused, player]);

  useEffect(() => {
    tracker.reset();
    const time = player.addListener("timeUpdate", ({ currentTime }) => {
      if (tracker.update(currentTime, player.duration)) {
        onNearEndRef.current?.();
      }
    });
    const end = player.addListener("playToEnd", () => {
      tracker.reset();
      onEndedRef.current?.();
    });
    return () => {
      time.remove();
      end.remove();
    };
  }, [player, tracker]);

  return (
    <View
      accessibilityLabel={title ?? t("a11y.gestureVideo")}
      className={cn(
        "w-full overflow-hidden rounded-lg bg-surface-sunken",
        className
      )}
      style={[ASPECT[aspect], style]}
      {...props}
    >
      <VideoView
        contentFit="contain"
        nativeControls
        player={player}
        style={FILL}
      />
    </View>
  );
}

const FILL = { height: "100%", width: "100%" } as const;
