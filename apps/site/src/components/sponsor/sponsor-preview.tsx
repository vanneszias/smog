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
import {
  PreviewFrame,
  PreviewPosterImage,
  type SponsorPreviewProps,
} from "./preview-slot";
import { useObjectUrl } from "./use-object-url";
import { useSourceMetadata } from "./use-source-metadata";

/**
 * When neither MP4 of the gesture loads (assets uploaded by the old system
 * have no static renditions until phase 8): the same composition over the
 * gesture's poster for a fixed 6 s, so the overlay is still exact. A 3:4
 * frame, the poster's own shape.
 */
const IMAGE_FALLBACK = {
  durationInFrames: 6 * RENDER_FPS,
  height: 960,
  width: 720,
} as const;

/** What the Player shows: the video, the image fallback, or only the poster. */
type Stage = "video" | "image" | "poster";

const PLAYER_STYLE = { height: "100%", width: "100%" } as const;

type FontState = "loading" | "ready" | "failed";

/**
 * The overlay font is loaded before the Player mounts (ruling 6), so the
 * first frame already has its text. Once loaded it is loaded for the page,
 * so a later preview (another gesture) starts `ready`, with no loading
 * state. A failed load mounts no Player: the overlay would only fail into
 * the video fallback, whose note would name the wrong cause (review M-1).
 */
function useOverlayFont(): FontState {
  const [state, setState] = useState<FontState>(() =>
    isOverlayFontLoaded() ? "ready" : "loading"
  );
  useEffect(() => {
    if (state !== "loading") {
      return;
    }
    let active = true;
    loadOverlayFont().then(
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
  }, [state]);
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
  const font = useOverlayFont();
  const source = useSourceMetadata(playbackId);
  const logoUrl = useObjectUrl(logo);
  const shownName = useLastValidName(displayName);
  const [failed, setFailed] = useState<{ image: boolean; video: boolean }>({
    image: false,
    video: false,
  });
  const { attach, handle, playing } = usePlayerHandle();

  let stage: Stage | null = null;
  if (font === "failed") {
    stage = "poster";
  } else if (font === "ready" && source.status !== "loading") {
    if (source.status === "ready" && !failed.video) {
      stage = "video";
    } else {
      stage = failed.image ? "poster" : "image";
    }
  }

  const props = useMemo((): SponsoredVideoProps | null => {
    if (stage === null || stage === "poster" || shownName === null) {
      return null;
    }
    const media =
      stage === "video" && source.status === "ready"
        ? {
            background: { kind: "video", src: source.src } as const,
            ...source.metadata,
          }
        : {
            background: {
              kind: "image",
              src: muxThumbnailUrl(playbackId, {
                width: IMAGE_FALLBACK.width,
              }),
            } as const,
            ...IMAGE_FALLBACK,
          };
    const parsed = sponsoredVideoPropsSchema.safeParse({
      background: media.background,
      displayName: shownName,
      durationInFrames: media.durationInFrames,
      height: media.height,
      logoUrl,
      width: media.width,
    });
    return parsed.success ? parsed.data : null;
  }, [logoUrl, playbackId, shownName, source, stage]);

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
  } else if (props !== null) {
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
