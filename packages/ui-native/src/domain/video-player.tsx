import { useTranslation } from "@smog/i18n/react";
import {
  createNearEndTracker,
  isEndCardVisible,
  muxStreamUrl,
} from "@smog/utils";
import { useVideoPlayer, VideoView } from "expo-video";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { View, type ViewProps } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { Surface } from "../components/surface";
import { Text } from "../components/text";
import { cn } from "../lib/cn";
import { SponsorEndCard } from "./sponsor-end-card";

export type VideoAspect = "3:4" | "16:9";

export interface VideoPlayerProps extends Omit<ViewProps, "children"> {
  /** 3:4 for gesture videos (default), 16:9 for others. */
  aspect?: VideoAspect;
  /**
   * Starts playing on its own, muted (as web, where browsers require it).
   * Not when the system asks for reduced motion (WCAG 2.2.2, inventory
   * P-25): the person starts it, with sound.
   */
  autoPlay?: boolean;
  className?: string;
  /**
   * The sponsor end card (phase 10b ruling 9): over the last seconds of the
   * video, timed from its duration, shows "Made possible by", the name as
   * typed and the logo (`logoSrc`: an absolute URL), in the viewer's
   * language. Leave it out for a gesture without a running sponsorship, and
   * for one whose rendered video already carries the name.
   */
  endCard?: { logoSrc?: string | null; name: string } | undefined;
  /**
   * Whether the screen is focused (`useIsFocused()`): the video pauses on
   * blur and an autoplaying one resumes on focus. Defaults to focused.
   */
  isFocused?: boolean;
  loop?: boolean;
  /**
   * The gesture's name in the viewer's language, drawn over the top of the
   * video (a textless video, phase 10b); leave it out to show none (the
   * picture still carries the name, or the viewer hid it). It is
   * decoration, hidden from the screen reader: the video's own label
   * (`title`) is the accessible name, so the name is never read twice. A
   * solid green pill (`Surface tone="header"`), so it reads on any frame;
   * it fades in unless the system asks for reduced motion.
   */
  nameOverlay?: string | undefined;
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
  autoPlay: autoPlayRequested = false,
  className,
  endCard,
  isFocused = true,
  loop = false,
  nameOverlay,
  onEnded,
  onNearEnd,
  playbackId,
  style,
  title,
  ...props
}: VideoPlayerProps): ReactElement {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const autoPlay = autoPlayRequested && !reducedMotion;
  const [tracker] = useState(createNearEndTracker);
  const [endCardShown, setEndCardShown] = useState(false);
  const hasEndCard = endCard !== undefined;
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
    setEndCardShown(false);
    const time = player.addListener("timeUpdate", ({ currentTime }) => {
      if (tracker.update(currentTime, player.duration)) {
        onNearEndRef.current?.();
      }
      if (hasEndCard) {
        // One render per change: the next loop or a seek back hides it again.
        setEndCardShown(isEndCardVisible(currentTime, player.duration));
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
  }, [hasEndCard, player, tracker]);

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
      {nameOverlay ? (
        <Animated.View
          accessibilityElementsHidden
          className="absolute inset-x-0 top-0 items-center p-3"
          entering={
            reducedMotion ? undefined : FadeIn.duration(OVERLAY_FADE_MS)
          }
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          testID="video-name-overlay"
        >
          <Surface
            className="max-w-full rounded-full px-4 py-1.5"
            tone="header"
          >
            <Text className="text-center" weight="semibold">
              {nameOverlay}
            </Text>
          </Surface>
        </Animated.View>
      ) : null}
      {endCard && endCardShown ? (
        // Above the native control bar.
        <SponsorEndCard
          className="absolute inset-x-3 bottom-16"
          logoSrc={endCard.logoSrc}
          name={endCard.name}
        />
      ) : null}
    </View>
  );
}

/** The name's fade-in, in ms. */
const OVERLAY_FADE_MS = 250;

const FILL = { height: "100%", width: "100%" } as const;
