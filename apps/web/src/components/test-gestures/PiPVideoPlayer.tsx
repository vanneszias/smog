import MuxPlayer from "@mux/mux-player-react";
import { Maximize2, Minimize2, PictureInPicture2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface PiPVideoPlayerProps {
  playbackId: string;
  gestureId: string;
  gestureName: string;
  className?: string;
  onPiPChange?: (isPiP: boolean) => void;
  autoPiPOnScroll?: boolean;
}

export function PiPVideoPlayer({
  playbackId,
  gestureId,
  gestureName,
  className = "",
  onPiPChange,
  autoPiPOnScroll = false,
}: PiPVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [isPiPSupported, setIsPiPSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Get video element from MuxPlayer
  const getVideoElement = useCallback(() => {
    if (!containerRef.current) {
      return null;
    }
    return containerRef.current.querySelector("video");
  }, []);

  // Check PiP support on mount
  useEffect(() => {
    if (document.pictureInPictureEnabled) {
      setIsPiPSupported(true);
    }
  }, []);

  // Listen to PiP events
  useEffect(() => {
    const videoElement = getVideoElement();
    if (!videoElement) {
      return;
    }

    const handleEnterPiP = () => {
      setIsPiPActive(true);
      onPiPChange?.(true);
    };

    const handleLeavePiP = () => {
      setIsPiPActive(false);
      onPiPChange?.(false);
    };

    videoElement.addEventListener("enterpictureinpicture", handleEnterPiP);
    videoElement.addEventListener("leavepictureinpicture", handleLeavePiP);

    return () => {
      videoElement.removeEventListener("enterpictureinpicture", handleEnterPiP);
      videoElement.removeEventListener("leavepictureinpicture", handleLeavePiP);
    };
  }, [onPiPChange, getVideoElement]);

  const enterPiP = useCallback(async () => {
    const videoElement = getVideoElement();
    if (!(videoElement && isPiPSupported)) {
      return;
    }

    try {
      if (!document.pictureInPictureElement) {
        await videoElement.requestPictureInPicture();
      }
    } catch (error) {
      console.error("Failed to enter PiP:", error);
    }
  }, [isPiPSupported, getVideoElement]);

  const exitPiP = useCallback(async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }
    } catch (error) {
      console.error("Failed to exit PiP:", error);
    }
  }, []);

  // Auto PiP on scroll (optional feature)
  useEffect(() => {
    if (!(autoPiPOnScroll && isPiPSupported && containerRef.current)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // If video is less than 50% visible and not in PiP, enter PiP
        if (
          entry &&
          entry.intersectionRatio < 0.5 &&
          !isPiPActive &&
          getVideoElement() &&
          !document.pictureInPictureElement
        ) {
          enterPiP();
        }
      },
      { threshold: [0.5] }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [autoPiPOnScroll, isPiPSupported, isPiPActive, enterPiP, getVideoElement]);

  const togglePiP = async () => {
    if (isPiPActive) {
      await exitPiP();
    } else {
      await enterPiP();
    }
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await container.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (error) {
      console.error("Failed to toggle fullscreen:", error);
    }
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-border bg-card ${className}`}
      ref={containerRef}
      style={{
        aspectRatio: "3/4",
        maxHeight: "60vh",
      }}
    >
      {/* Video Player */}
      <MuxPlayer
        accentColor="var(--primary)"
        key={gestureId}
        playbackId={playbackId}
        streamType="on-demand"
        style={{
          width: "100%",
          height: "100%",
          aspectRatio: "3/4",
          objectFit: "contain",
        }}
        title={gestureName}
      />

      {/* Custom Control Overlay */}
      <div className="absolute top-4 right-4 flex gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {/* PiP Button */}
        {isPiPSupported && (
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-all hover:bg-black/80"
            onClick={togglePiP}
            title={
              isPiPActive ? "Exit Picture-in-Picture" : "Picture-in-Picture"
            }
            type="button"
          >
            <PictureInPicture2
              className={`h-5 w-5 ${isPiPActive ? "text-primary" : ""}`}
            />
          </button>
        )}

        {/* Fullscreen Button */}
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-all hover:bg-black/80"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          type="button"
        >
          {isFullscreen ? (
            <Minimize2 className="h-5 w-5" />
          ) : (
            <Maximize2 className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* PiP Status Indicator */}
      {isPiPActive && (
        <div className="absolute right-4 bottom-4 left-4">
          <div className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-center backdrop-blur-sm">
            <p className="font-medium text-primary text-sm">
              Playing in Picture-in-Picture
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
