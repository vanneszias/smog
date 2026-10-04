import { Player, type PlayerRef } from "@remotion/player";
import { useTranslation } from "@smog/i18n/react";
import {
  isOverlayFontLoaded,
  loadOverlayFont,
  overlayStartFrame,
  SponsoredVideo,
  type SponsoredVideoProps,
  sponsoredVideoPropsSchema,
} from "@smog/render/composition";
import { RENDER_FPS } from "@smog/render/contract";
import { muxThumbnailUrl } from "@smog/utils";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type PosterSize, readPosterSize } from "./poster-size";
import {
  PreviewFrame,
  PreviewPosterImage,
  type SponsorPreviewProps,
} from "./preview-slot";
import { useObjectUrl } from "./use-object-url";
import { type SourceState, useSourceMetadata } from "./use-source-metadata";

/**
 * When neither MP4 of the gesture loads (assets uploaded by the old system
 * have no static renditions until phase 8): the same composition over the
 * gesture's poster for a fixed 6 s, so the overlay is still exact. The
 * poster is fetched at this width; the composition takes its natural size
 * (rounded down to even, as the render rounds the source), so the frame
 * has the gesture's own shape whatever it is (fix wave M-5).
 */
const IMAGE_FALLBACK = {
  durationInFrames: 6 * RENDER_FPS,
  posterWidth: 720,
} as const;

function evenFloor(size: number): number {
  return Math.floor(size / 2) * 2;
}

type PosterState =
  | { status: "loading" }
  | { size: PosterSize; status: "ready" }
  | { status: "failed" };

/**
 * The poster's natural size once `src` is set (the image fallback is
 * needed), even, or `failed` when it does not load or has no usable size.
 */
function usePosterSize(src: string | null): PosterState {
  const [result, setResult] = useState<{
    src: string;
    state: PosterState;
  } | null>(null);
  useEffect(() => {
    if (src === null) {
      return;
    }
    const controller = new AbortController();
    readPosterSize(src, controller.signal).then(
      ({ height, width }) => {
        const size = { height: evenFloor(height), width: evenFloor(width) };
        setResult({
          src,
          state:
            size.width >= 2 && size.height >= 2
              ? { size, status: "ready" }
              : { status: "failed" },
        });
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        console.warn("[sponsorPreview] Failed to read the poster:", error);
        setResult({ src, state: { status: "failed" } });
      }
    );
    return () => controller.abort();
  }, [src]);
  return result !== null && result.src === src
    ? result.state
    : { status: "loading" };
}

/** What the Player shows: the video, the image fallback, or only the poster. */
type Stage = "video" | "image" | "poster";

const PLAYER_STYLE = { height: "100%", width: "100%" } as const;

type FontState = "loading" | "ready" | "failed";

/**
 * The overlay font is loaded before the Player mounts (ruling 6), so the
 * first frame already has its text: the subsets `text` (the name shown)
 * needs, not all of them (fix wave M-2). Once loaded they are loaded for
 * the page, so a later preview (another gesture) starts `ready`, with no
 * loading state. A name that needs another subset later loads it while the
 * Player stays (the overlay waits for it too). A failed load mounts no
 * Player: the overlay would only fail into the video fallback, whose note
 * would name the wrong cause (review M-1).
 */
function useOverlayFont(text: string): FontState {
  const [state, setState] = useState<FontState>(() =>
    isOverlayFontLoaded(text) ? "ready" : "loading"
  );
  useEffect(() => {
    if (state === "failed" || isOverlayFontLoaded(text)) {
      return;
    }
    let active = true;
    loadOverlayFont(text).then(
      () => {
        if (active) {
          setState("ready");
        }
      },
      (error: unknown) => {
        console.error(
          "[sponsorPreview] Failed to load the overlay font:",
          error
        );
        if (active) {
          setState("failed");
        }
      }
    );
    return () => {
      active = false;
    };
  }, [state, text]);
  return state;
}

const displayNameSchema = sponsoredVideoPropsSchema.shape.displayName;

/** The name as typed while it is valid; the last valid one while it is not. */
function useLastValidName(displayName: string): string | null {
  const valid = displayNameSchema.safeParse(displayName).success;
  const [last, setLast] = useState(valid ? displayName : null);
  if (valid && displayName !== last) {
    setLast(displayName);
  }
  return valid ? displayName : last;
}

/** Tells the preview, once, that the Player's composition failed. */
function FailureSignal({ onFail }: { onFail: () => void }): ReactNode {
  useEffect(() => {
    onFail();
  }, [onFail]);
  return null;
}

/**
 * The mounted Player's handle, and its play state from its events. The
 * handle is read through a ref; only its arrival and departure render.
 */
function usePlayerHandle(): {
  attach: (handle: PlayerRef | null) => void;
  handle: RefObject<PlayerRef | null>;
  playing: boolean;
} {
  const handle = useRef<PlayerRef | null>(null);
  const [mounted, setMounted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const attach = useCallback((next: PlayerRef | null) => {
    handle.current = next;
    setMounted(next !== null);
    if (next === null) {
      setPlaying(false);
    }
  }, []);
  useEffect(() => {
    const player = handle.current;
    if (!(mounted && player)) {
      return;
    }
    const onPlay = (): void => setPlaying(true);
    const onStop = (): void => setPlaying(false);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onStop);
    player.addEventListener("ended", onStop);
    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onStop);
      player.removeEventListener("ended", onStop);
    };
  }, [mounted]);
  return { attach, handle, playing };
}

interface Failed {
  image: boolean;
  video: boolean;
}

/**
 * What the Player shows, or `null` while something loads: the video once
 * its metadata read and while it plays; else the image fallback once its
 * poster's size is known; else (or when the font failed) only the poster.
 */
function previewStage({
  failed,
  font,
  poster,
  source,
}: {
  failed: Failed;
  font: FontState;
  poster: PosterState;
  source: SourceState;
}): Stage | null {
  if (font === "failed") {
    return "poster";
  }
  if (font === "loading" || source.status === "loading") {
    return null;
  }
  if (source.status === "ready" && !failed.video) {
    return "video";
  }
  if (failed.image || poster.status === "failed") {
    return "poster";
  }
  return poster.status === "ready" ? "image" : null;
}

type PreviewMedia = Pick<
  SponsoredVideoProps,
  "background" | "durationInFrames" | "height" | "width"
>;

/** The composition's background, size and length for a stage. */
function previewMedia(
  stage: Stage | null,
  source: SourceState,
  poster: { size: PosterSize | null; url: string }
): PreviewMedia | null {
  if (stage === "video" && source.status === "ready") {
    return {
      background: { kind: "video", src: source.src },
      ...source.metadata,
    };
  }
  if (stage === "image" && poster.size) {
    return {
      background: { kind: "image", src: poster.url },
      durationInFrames: IMAGE_FALLBACK.durationInFrames,
      ...poster.size,
    };
  }
  return null;
}

/**
 * `SponsorPreview` (S-10, phase 7 ruling 8): the real `SponsoredVideo`
 * composition in `@remotion/player`, over the gesture's Mux MP4, with the
 * sponsor's name and local logo. It loads paused on the last frame, muted,
 * with the kit's controls; Play replays from the start. Lazy loaded by
 * `SponsorPreviewSlot`, which remounts it per gesture.
 */
export function SponsorPreview({
  className,
  displayName,
  logo,
  name,
  playbackId,
}: SponsorPreviewProps): ReactNode {
  const { t } = useTranslation();
  const shownName = useLastValidName(displayName);
  const font = useOverlayFont(shownName ?? "");
  const source = useSourceMetadata(playbackId);
  const logoUrl = useObjectUrl(logo);
  const [failed, setFailed] = useState<Failed>({
    image: false,
    video: false,
  });
  const { attach, handle, playing } = usePlayerHandle();
  const posterUrl = muxThumbnailUrl(playbackId, {
    width: IMAGE_FALLBACK.posterWidth,
  });
  const needsImage =
    font === "ready" &&
    source.status !== "loading" &&
    (source.status !== "ready" || failed.video) &&
    !failed.image;
  const poster = usePosterSize(needsImage ? posterUrl : null);

  const stage = previewStage({ failed, font, poster, source });

  const posterSize = poster.status === "ready" ? poster.size : null;
  const props = useMemo((): SponsoredVideoProps | null => {
    const media = previewMedia(stage, source, {
      size: posterSize,
      url: posterUrl,
    });
    if (media === null || shownName === null) {
      return null;
    }
    const parsed = sponsoredVideoPropsSchema.safeParse({
      background: media.background,
      displayName: shownName,
      durationInFrames: media.durationInFrames,
      height: media.height,
      logoUrl,
      width: media.width,
    });
    return parsed.success ? parsed.data : null;
  }, [logoUrl, posterSize, posterUrl, shownName, source, stage]);

  const onFail = useCallback(() => {
    setFailed((current) =>
      stage === "video"
        ? { ...current, video: true }
        : { ...current, image: true }
    );
  }, [stage]);
  const errorFallback = useCallback(
    () => <FailureSignal onFail={onFail} />,
    [onFail]
  );

  const duration = props?.durationInFrames ?? 1;
  const onToggle = useCallback(() => {
    const player = handle.current;
    if (!player) {
      return;
    }
    if (playing) {
      player.pause();
      return;
    }
    if (player.getCurrentFrame() >= duration - 1) {
      player.seekTo(0);
    }
    player.play();
  }, [duration, handle, playing]);
  const onEnding = useCallback(() => {
    const player = handle.current;
    if (!player) {
      return;
    }
    player.seekTo(
      Math.max(
        0,
        overlayStartFrame({ durationInFrames: duration, fps: RENDER_FPS })
      )
    );
    player.play();
  }, [duration, handle]);

  const showsNote = stage === "image" || stage === "poster";
  let note: string | null = null;
  if (font === "failed") {
    note = t("sponsor.preview.unavailable");
  } else if (stage === null) {
    note = t("sponsor.preview.loading");
  } else if (showsNote) {
    note = t("sponsor.preview.fallbackNote");
  }
  let controls:
    | { onEnding: () => void; onToggle: () => void; playing: boolean }
    | false
    | null = null;
  if (props === null && stage !== null) {
    controls = false;
  } else if (props !== null || failed.video) {
    // Also while the image fallback reads its poster's size after the
    // video failed: a disabled button would drop the focus (review M-3).
    // Enabled from the first frame on, and through a remount (the image
    // fallback replacing the video), so a focused button keeps its focus
    // (review M-3); without a Player handle they do nothing.
    controls = { onEnding, onToggle, playing };
  }

  return (
    <PreviewFrame
      className={className}
      controls={controls}
      name={name}
      note={note}
    >
      {props ? (
        <Player
          acknowledgeRemotionLicense
          clickToPlay={false}
          component={SponsoredVideo}
          compositionHeight={props.height}
          compositionWidth={props.width}
          controls={false}
          durationInFrames={props.durationInFrames}
          errorFallback={errorFallback}
          fps={RENDER_FPS}
          initialFrame={props.durationInFrames - 1}
          initiallyMuted
          inputProps={props}
          // A new background is a new Player; a new name or logo is not.
          key={stage}
          loop={false}
          moveToBeginningWhenEnded={false}
          // No shared <audio> tags: the composition has no sound, and their
          // silent `data:` MP3 is refused by the CSP's `media-src`.
          numberOfSharedAudioTags={0}
          ref={attach}
          spaceKeyToPlayOrPause={false}
          style={PLAYER_STYLE}
        />
      ) : (
        <PreviewPosterImage playbackId={playbackId} />
      )}
    </PreviewFrame>
  );
}
