import type { MuxPlayerProps } from "@mux/mux-player-react";
import MuxPlayer from "@mux/mux-player-react";
import { VideoOff } from "lucide-react";
import { forwardRef, type ReactNode, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { cn } from "../lib/cn";

export type VideoPlayerProps = Omit<
  MuxPlayerProps,
  "playbackId" | "metadata" | "title"
> & {
  /** Absent while a gesture's video is still processing, and after a delete. */
  playbackId?: string | null;
  /** The video's title, reported to Mux Data and used by the error state. */
  title: string;
  className?: string;
  errorMessage?: ReactNode;
};

/**
 * A Mux player with the three states a video has before it plays.
 *
 * `loading` is ours, not the player's: `<mux-player>` renders its own black
 * box immediately and gives no sign that anything is coming, so this wrapper
 * holds a `Skeleton` over it until `loadeddata` fires. The player stays
 * mounted underneath the whole time — unmounting it would mean nothing ever
 * loads and the skeleton pulses for ever.
 *
 * `error` covers both halves: a gesture with no `playbackId` (its video is
 * still processing) and a player that reports a failure after it started.
 * Both end at the same message, because "this video will not play" is all a
 * reader can act on.
 *
 * The box keeps a 16:9 aspect ratio in every state, so the page does not jump
 * when the video arrives or fails to.
 *
 * A caller's `onLoadedData` and `onError` still run — they are chained, not
 * replaced, which is the part a wrapper usually gets wrong.
 */
export const VideoPlayer = forwardRef<HTMLDivElement, VideoPlayerProps>(
  (
    {
      className,
      playbackId,
      title,
      errorMessage = "Video niet beschikbaar",
      onLoadedData,
      onError,
      ...props
    },
    ref
  ) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasFailed, setHasFailed] = useState(false);
    const [loadedId, setLoadedId] = useState(playbackId);

    /*
     * A new gesture is a new video: without this reset the player swaps its
     * source while the wrapper still says the previous one is ready, and the
     * reader watches a black box with no placeholder.
     *
     * Adjusted during the render that brings the new id rather than in an
     * effect, which is what React's own guidance says for state derived from
     * a changed prop: an effect would paint the previous video's "ready"
     * frame first and only then put the placeholder back.
     */
    if (playbackId !== loadedId) {
      setLoadedId(playbackId);
      setIsLoaded(false);
      setHasFailed(false);
    }

    const hasVideo =
      playbackId !== undefined && playbackId !== null && playbackId !== "";
    const isBroken = !hasVideo || hasFailed;

    return (
      <div
        aria-busy={isBroken || isLoaded ? undefined : true}
        className={cn(
          "relative aspect-video w-full overflow-hidden rounded-lg bg-surface",
          className
        )}
        ref={ref}
      >
        {isBroken ? (
          <EmptyState
            className="absolute inset-0 justify-center border-0 p-6"
            icon={<VideoOff aria-hidden="true" className="size-8" />}
            title={errorMessage}
          />
        ) : (
          <>
            <MuxPlayer
              className="size-full"
              metadata={{ video_title: title }}
              onError={(event) => {
                setHasFailed(true);
                onError?.(event);
              }}
              onLoadedData={(event) => {
                setIsLoaded(true);
                onLoadedData?.(event);
              }}
              playbackId={playbackId}
              streamType="on-demand"
              {...props}
            />
            {isLoaded ? null : (
              <Skeleton className="absolute inset-0 size-full rounded-lg" />
            )}
          </>
        )}
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";
