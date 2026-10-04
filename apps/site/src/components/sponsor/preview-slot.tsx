import { useTranslation } from "@smog/i18n/react";
import { Button, cn } from "@smog/ui-web";
import { muxThumbnailUrl } from "@smog/utils";
import { Pause, Play, SkipForward } from "lucide-react";
import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type FocusEvent,
  type LazyExoticComponent,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";

export interface SponsorPreviewProps {
  className?: string;
  /** The name in the video (trimmed); an invalid one keeps the last valid. */
  displayName: string;
  /** The local logo file (previewed through an object URL), or none. */
  logo: Blob | null;
  /** The gesture's name: it names the preview. */
  name: string;
  playbackId: string;
}

/** The lazy preview module's shape. */
export interface PreviewModule {
  SponsorPreview: ComponentType<SponsorPreviewProps>;
}

export type LazyPreview = LazyExoticComponent<
  ComponentType<SponsorPreviewProps>
>;

/** A lazy preview component over a module loader (tests pass their own). */
export function lazyPreview(load: () => Promise<PreviewModule>): LazyPreview {
  return lazy(() =>
    load().then((module) => ({
      default: module.SponsorPreview,
    }))
  );
}

/**
 * The Remotion Player preview is client-only (phase 7 ruling 8, I-6): Vite
 * replaces `import.meta.env.SSR` per environment, so the Worker build drops
 * this import and bundles no `remotion` or `mediabunny`
 * (`scripts/deploy-guard.ts` checks `dist/server`), and in the browser they
 * load as a lazy chunk, never in an entry chunk. The server and the first
 * client render show the poster in the same box.
 */
const LazySponsorPreview = import.meta.env.SSR
  ? null
  : lazyPreview(() => import("./sponsor-preview"));

const noopSubscribe = (): (() => void) => () => undefined;

/** `false` on the server and during hydration, `true` after. */
function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

interface PreviewControls {
  onEnding: () => void;
  onToggle: () => void;
  playing: boolean;
}

export interface PreviewFrameProps {
  children: ReactNode;
  className?: string;
  /** The kit controls; `null` disables them (loading), `false` hides them. */
  controls: PreviewControls | null | false;
  name: string;
  /** A status line under the controls (loading, the fallback note). */
  note?: string | null;
}

/**
 * The preview's frame: a fixed 3:4 box (the Player letterboxes the video
 * in it, so nothing shifts when it mounts), the kit's play/pause and "Show
 * the ending" (Remotion's own controls carry English tooltips), and a
 * polite status line.
 */
export function PreviewFrame({
  children,
  className,
  controls,
  name,
  note = null,
}: PreviewFrameProps): ReactNode {
  const { t } = useTranslation();
  const playing = controls ? controls.playing : false;
  const noteRef = useRef<HTMLParagraphElement>(null);
  // Whether a control had the focus: when the controls go away (every
  // fallback failed), the focus moves to the note that says why, instead
  // of dropping to the page (review M-3).
  const controlsFocused = useRef(false);
  const onControlsFocus = useCallback(() => {
    controlsFocused.current = true;
  }, []);
  const controlsRef = useRef<HTMLDivElement>(null);
  const onControlsBlur = useCallback((event: FocusEvent<HTMLButtonElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && !controlsRef.current?.contains(next)) {
      controlsFocused.current = false;
    }
  }, []);
  const hidden = controls === false;
  useEffect(() => {
    if (hidden && controlsFocused.current) {
      controlsFocused.current = false;
      noteRef.current?.focus();
    }
  }, [hidden]);
  return (
    <figure
      className={cn("flex w-full max-w-[20rem] flex-col gap-3", className)}
    >
      <div
        aria-label={t("sponsor.preview.label", { name })}
        className="relative aspect-3/4 w-full overflow-hidden rounded-lg border border-border-subtle bg-surface-sunken"
        role="img"
      >
        {/* The frame's label names the picture; the composition's own
            media (the video, the poster, the logo) is not read out. */}
        <div aria-hidden="true" className="absolute inset-0">
          {children}
        </div>
      </div>
      {hidden ? null : (
        <div className="flex flex-wrap gap-2" ref={controlsRef}>
          <Button
            disabled={controls === null}
            icon={playing ? <Pause /> : <Play />}
            onBlur={onControlsBlur}
            onClick={controls ? controls.onToggle : undefined}
            onFocus={onControlsFocus}
            variant="secondary"
          >
            {playing ? t("sponsor.preview.pause") : t("sponsor.preview.play")}
          </Button>
          <Button
            disabled={controls === null}
            icon={<SkipForward />}
            onBlur={onControlsBlur}
            onClick={controls ? controls.onEnding : undefined}
            onFocus={onControlsFocus}
            variant="ghost"
          >
            {t("sponsor.preview.showEnding")}
          </Button>
        </div>
      )}
      <p
        aria-live="polite"
        className="rounded-sm text-body-sm text-foreground-muted focus:outline-2 focus:outline-focus-ring focus:outline-offset-2"
        ref={noteRef}
        tabIndex={-1}
      >
        {note}
      </p>
    </figure>
  );
}

/** The gesture's Mux poster, filling the frame. */
export function PreviewPosterImage({
  playbackId,
}: {
  playbackId: string;
}): ReactNode {
  return (
    <img
      alt=""
      className="absolute inset-0 size-full object-cover"
      decoding="async"
      height={640}
      src={muxThumbnailUrl(playbackId, { width: 480 })}
      width={480}
    />
  );
}

interface PreviewBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

/**
 * Keeps a preview failure inside the preview (fix wave I-1): the lazy
 * chunk that does not load (a deploy replaced its hash, a dropped mobile
 * connection) or an error the Player throws outside the composition (the
 * composition's own go to its `errorFallback`). Without it the error
 * reaches the route, and the review step, Turnstile and Pay go with it.
 * React has no hook for this, hence the class.
 */
class PreviewBoundary extends Component<
  PreviewBoundaryProps,
  { failed: boolean }
> {
  override state: { failed: boolean } = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(
      "[sponsorPreview] Failed to load the preview:",
      error,
      info.componentStack
    );
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface PreviewSlotProps extends SponsorPreviewProps {
  /** The lazy preview; `null` on the server (the poster only). */
  preview: LazyPreview | null;
}

/**
 * The slot over a given lazy preview: the poster until it has loaded, the
 * poster with the "unavailable" note and no controls when it fails (to
 * load, or to render). One boundary per gesture, so another gesture
 * renders afresh after a Player error; a chunk that failed stays failed
 * for the page (React keeps the lazy import's rejection).
 */
export function PreviewSlot({
  preview: Preview,
  ...props
}: PreviewSlotProps): ReactNode {
  const { t } = useTranslation();
  const mounted = useMounted();
  const poster = (
    <PreviewFrame className={props.className} controls={null} name={props.name}>
      <PreviewPosterImage playbackId={props.playbackId} />
    </PreviewFrame>
  );
  if (!mounted || Preview === null) {
    return poster;
  }
  const unavailable = (
    <PreviewFrame
      className={props.className}
      controls={false}
      name={props.name}
      note={t("sponsor.preview.unavailable")}
    >
      <PreviewPosterImage playbackId={props.playbackId} />
    </PreviewFrame>
  );
  return (
    <PreviewBoundary fallback={unavailable} key={props.playbackId}>
      <Suspense fallback={poster}>
        <Preview {...props} />
      </Suspense>
    </PreviewBoundary>
  );
}

/**
 * How the sponsored video ends, for one gesture (S-10): the Remotion
 * Player over the gesture's MP4 once the lazy module has loaded, the
 * poster before, and the poster with a note if it cannot load.
 */
export function SponsorPreviewSlot(props: SponsorPreviewProps): ReactNode {
  return <PreviewSlot {...props} preview={LazySponsorPreview} />;
}
