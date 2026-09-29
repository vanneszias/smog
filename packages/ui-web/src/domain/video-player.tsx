import type { MuxCSSProperties } from "@mux/mux-player-react";
import MuxPlayer from "@mux/mux-player-react/lazy";
import { useTranslation } from "@smog/i18n/react";
import { createNearEndTracker, muxThumbnailUrl } from "@smog/utils";
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "../lib/cn";

export type VideoAspect = "3:4" | "16:9";

export interface VideoPlayerProps
  extends Omit<ComponentProps<"section">, "children" | "title"> {
  /** 3:4 for gesture videos (default), 16:9 for others. */
  aspect?: VideoAspect;
  /** Starts playing on its own, muted (browsers block sound on autoplay). */
  autoPlay?: boolean;
  loop?: boolean;
  /** At the end of each playthrough (every loop). */
  onEnded?: () => void;
  /** Once per playthrough, when 5 s or less are left (the CourseBanner cue). */
  onNearEnd?: () => void;
  playbackId: string;
  /** Names the player (the gesture's name; `a11y.gestureVideo` by default). */
  title?: string;
}

const ASPECT = { "3:4": "aspect-3/4", "16:9": "aspect-video" } as const;

/** mux-player fills the frame; its colours follow the theme's roles. */
const PLAYER_STYLE: MuxCSSProperties = {
  "--media-accent-color": "var(--color-primary)",
  "--media-background-color": "var(--color-surface-sunken)",
  "--media-object-fit": "contain",
  height: "100%",
  width: "100%",
};

interface TimeEventTarget {
  currentTime?: number;
  duration?: number;
}

/**
 * The gesture video: Mux Player, loaded lazily (`@mux/mux-player-react/lazy`
 * keeps the player out of the initial bundle and shows the poster until the
 * frame scrolls into view). Mux Data tracking and its cookies are off.
 */
export function VideoPlayer({
  aspect = "3:4",
  autoPlay = false,
  className,
  loop = false,
  onEnded,
  onNearEnd,
  playbackId,
  title,
  ...props
}: VideoPlayerProps): ReactNode {
  const { t } = useTranslation();
  const [tracker] = useState(createNearEndTracker);
  const onNearEndRef = useRef(onNearEnd);
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onNearEndRef.current = onNearEnd;
    onEndedRef.current = onEnded;
  }, [onEnded, onNearEnd]);
  useEffect(() => {
    // A new video starts a new playthrough.
    if (playbackId) {
      tracker.reset();
    }
  }, [playbackId, tracker]);

  const handleTimeUpdate = useCallback(
    (event: Event | { target: unknown }): void => {
      const target = event.target as TimeEventTarget | null;
      if (tracker.update(target?.currentTime ?? 0, target?.duration ?? 0)) {
        onNearEndRef.current?.();
      }
    },
    [tracker]
  );
  const handleEnded = useCallback((): void => {
    tracker.reset();
    onEndedRef.current?.();
  }, [tracker]);

  const name = title ?? t("a11y.gestureVideo");
  return (
    <section
      aria-label={name}
      className={cn(
        "relative w-full overflow-hidden rounded-lg bg-surface-sunken",
        ASPECT[aspect],
        className
      )}
      {...props}
    >
      <MuxPlayer
        autoPlay={autoPlay ? "muted" : false}
        disableCookies
        disableTracking
        loop={loop}
        muted={autoPlay}
        onEnded={handleEnded}
        onTimeUpdate={handleTimeUpdate}
        placeholder={muxThumbnailUrl(playbackId, { width: 720 })}
        playbackId={playbackId}
        playsInline
        streamType="on-demand"
        style={PLAYER_STYLE}
      />
    </section>
  );
}
