import type { MuxCSSProperties } from "@mux/mux-player-react";
import { useTranslation } from "@smog/i18n/react";
import {
  createNearEndTracker,
  isEndCardVisible,
  muxThumbnailUrl,
} from "@smog/utils";
import {
  type ComponentProps,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { cn } from "../lib/cn";
import { SponsorEndCard } from "./sponsor-end-card";

export type VideoAspect = "3:4" | "16:9";

export interface VideoPlayerProps
  extends Omit<ComponentProps<"section">, "children" | "title"> {
  /** 3:4 for gesture videos (default), 16:9 for others. */
  aspect?: VideoAspect;
  /** Starts playing on its own, muted (browsers block sound on autoplay). */
  autoPlay?: boolean;
  /**
   * The sponsor end card (phase 10b ruling 9): over the last seconds of the
   * video, timed from its duration (`endCardStart`), shows "Made possible
   * by", the name as typed and the logo, in the viewer's language. Leave it
   * out for a gesture without a running sponsorship, and for one whose
   * rendered video already carries the name.
   */
  endCard?: { logoSrc?: string | null; name: string } | undefined;
  loop?: boolean;
  /**
   * The gesture's name in the viewer's language, drawn over the top of the
   * video (a textless video, phase 10b). Leave it out to show none: the
   * caller does while the picture still has the name burned in
   * (`needsRecut`) and when the viewer chose to hide it. The overlay is
   * decoration (`aria-hidden`): the frame's own name (`title`) is the
   * accessible one, so the name is never read twice.
   */
  nameOverlay?: string | undefined;
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
  "--media-background-color": "var(--color-muted)",
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

type PlayerElement = Pick<Element, "setAttribute"> & {
  media?: Element | null;
};

/**
 * Points mux-player's fullscreen button at the frame. mux-player only
 * honours `fullscreen-element` when the player is already inside that
 * element, and React sets attributes before it inserts the node, so the
 * attribute is set again here, once the player is in the document.
 */
function fullscreenFrame(player: PlayerElement | null, frameId: string): void {
  player?.setAttribute("fullscreen-element", frameId);
}

/**
 * The name over the video: a solid green pill (`sidebar`, the pair
 * `sidebar-foreground` on `sidebar` is in `contrast.ts`), so the text is
 * readable on any frame, light or dark. It fades in, and does not move or
 * fade when the system asks for reduced motion. Taps go through it to the
 * player's controls.
 */
function NameOverlay({ name }: { name: string }): ReactNode {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-3"
      data-slot="video-name-overlay"
    >
      <span className="max-w-full animate-fade-in break-words rounded-full bg-sidebar px-4 py-1.5 text-center font-semibold text-sidebar-foreground text-title-3 shadow-1 motion-reduce:animate-none">
        {name}
      </span>
    </div>
  );
}

interface TimeEventTarget {
  currentTime?: number;
  duration?: number;
}

/**
 * The gesture video in its frame (rounded, ringed, raised: the video is the
 * page's centre): Mux Player, loaded on the client only as its own chunk,
 * with the Mux poster until it is ready. Mux Data tracking and its
 * cookies are off.
 */
export function VideoPlayer({
  aspect = "3:4",
  autoPlay = false,
  className,
  endCard,
  id,
  loop = false,
  nameOverlay,
  onEnded,
  onNearEnd,
  playbackId,
  title,
  ...props
}: VideoPlayerProps): ReactNode {
  const { t } = useTranslation();
  // The frame is what goes fullscreen (`fullscreen-element`), so the name
  // overlay and the sponsor end card, which are siblings of the player, stay
  // on screen; by default the player fullscreens only itself.
  const generatedId = useId();
  const frameId = id ?? generatedId;
  const attachPlayer = useCallback(
    (player: PlayerElement | null) => {
      disableRemotePlayback(player);
      fullscreenFrame(player, frameId);
    },
    [frameId]
  );
  const mounted = useMounted();
  const [tracker] = useState(createNearEndTracker);
  const [endCardShown, setEndCardShown] = useState(false);
  const hasEndCard = endCard !== undefined;
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
      setEndCardShown(false);
    }
  }, [playbackId, tracker]);

  const handleTimeUpdate = useCallback(
    (event: Event | { target: unknown }): void => {
      const target = event.target as TimeEventTarget | null;
      const currentTime = target?.currentTime ?? 0;
      const duration = target?.duration ?? 0;
      if (tracker.update(currentTime, duration)) {
        onNearEndRef.current?.();
      }
      if (hasEndCard) {
        // One render per change: a seek back or the next loop hides it again.
        setEndCardShown(isEndCardVisible(currentTime, duration));
      }
    },
    [hasEndCard, tracker]
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
        "relative w-full overflow-hidden rounded-2xl bg-muted shadow-1 ring-1 ring-foreground/10",
        ASPECT[aspect],
        className
      )}
      id={frameId}
      {...props}
    >
      {mounted && MuxPlayer ? (
        <Suspense fallback={poster}>
          <MuxPlayer
            autoPlay={autoPlay ? "muted" : false}
            disableCookies
            disableTracking
            fullscreenElement={frameId}
            loop={loop}
            muted={autoPlay}
            onEnded={handleEnded}
            onTimeUpdate={handleTimeUpdate}
            playbackId={playbackId}
            playsInline
            poster={posterUrl}
            ref={attachPlayer}
            streamType="on-demand"
            style={PLAYER_STYLE}
          />
        </Suspense>
      ) : (
        poster
      )}
      {nameOverlay ? <NameOverlay name={nameOverlay} /> : null}
      {endCard && endCardShown ? (
        // Above the control bar of the player.
        <SponsorEndCard
          className="absolute inset-x-3 bottom-16 z-10"
          logoSrc={endCard.logoSrc}
          name={endCard.name}
        />
      ) : null}
    </section>
  );
}
