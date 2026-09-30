import type { MuxCSSProperties } from "@mux/mux-player-react";
import { useTranslation } from "@smog/i18n/react";
import { createNearEndTracker, muxThumbnailUrl } from "@smog/utils";
import {
  type ComponentProps,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
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
  /**
   * When playback reaches the end. Web: never while `loop` is on (a looping
   * media element does not fire `ended`); `onNearEnd` still fires every loop.
   */
  onEnded?: () => void;
  /** Once per playthrough, when 5 s or less are left (the CourseBanner cue). */
  onNearEnd?: () => void;
  playbackId: string;
  /** Names the player (the gesture's name; `a11y.gestureVideo` by default). */
  title?: string;
}

/**
 * Mux Player is client-only: Vite replaces `import.meta.env.SSR` per
 * environment, so the server (Worker) build drops this import and emits no
 * player chunk (`apps/site/scripts/deploy-guard.ts` checks `dist/server`).
 * The server and the first client render show the poster instead.
 */
const MuxPlayer = import.meta.env.SSR
  ? null
  : lazy(() => import("@mux/mux-player-react"));

const POSTER_WIDTH = 720;

const noopSubscribe = (): (() => void) => () => undefined;

/** `false` on the server and during hydration, `true` after. */
function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
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

/**
 * No Google Cast: Chromium-based browsers would load Cast's sender script
 * from www.gstatic.com, which the site CSP does not allow, and the old
 * site never offered casting either (DECISIONS, phase 4 task 6). Set on the
 * inner `<mux-video>` as soon as mux-player has rendered it, before
 * media-chrome first asks for `media.remote`.
 */
function disableRemotePlayback(
  player: { media?: Element | null } | null
): void {
  player?.media?.setAttribute("disableremoteplayback", "");
}

interface TimeEventTarget {
  currentTime?: number;
  duration?: number;
}

/**
 * The gesture video: Mux Player, loaded on the client only as its own
 * chunk, with the Mux poster until it is ready. Mux Data tracking and its
 * cookies are off.
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
  const mounted = useMounted();
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
  const posterUrl = muxThumbnailUrl(playbackId, { width: POSTER_WIDTH });
  const poster = (
    <img
      alt=""
      className="size-full object-contain"
      data-slot="video-poster"
      height={Math.round(
        aspect === "3:4" ? (POSTER_WIDTH * 4) / 3 : (POSTER_WIDTH * 9) / 16
      )}
      src={posterUrl}
      width={POSTER_WIDTH}
    />
  );
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
      {mounted && MuxPlayer ? (
        <Suspense fallback={poster}>
          <MuxPlayer
            autoPlay={autoPlay ? "muted" : false}
            disableCookies
            disableTracking
            loop={loop}
            muted={autoPlay}
            onEnded={handleEnded}
            onTimeUpdate={handleTimeUpdate}
            playbackId={playbackId}
            playsInline
            poster={posterUrl}
            ref={disableRemotePlayback}
            streamType="on-demand"
            style={PLAYER_STYLE}
          />
        </Suspense>
      ) : (
        poster
      )}
    </section>
  );
}
