/**
 * @fileoverview Core playback state hook for the VideoPlayer component.
 *
 * Manages the expo-video player instance, player event subscriptions,
 * loading state, and play/pause logic.
 *
 * @example
 * const { player, isLoading, isPlaying, togglePlayPause } = useVideoPlayerState({
 *   playbackId,
 *   autoPlay,
 *   onComplete,
 *   onPlayToEnd,
 * });
 */

import { useIsFocused } from "@react-navigation/native";
import { MUX_STREAM_DOMAIN } from "@smog/config/urls";
import { useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseVideoPlayerStateOptions {
  playbackId: string;
  autoPlay: boolean;
  onComplete?: () => void;
  onPlayToEnd?: () => void;
}

/**
 * Core VideoPlayer state and playback logic.
 *
 * Handles:
 * - expo-video player instance creation
 * - Event subscription (playingChange, statusChange, timeUpdate, playToEnd)
 * - Navigation focus handling (pause on unfocus)
 * - Cleanup on unmount
 *
 * @returns Player instance + derived UI state + `togglePlayPause` handler.
 */
export function useVideoPlayerState({
  playbackId,
  autoPlay,
  onComplete,
  onPlayToEnd,
}: UseVideoPlayerStateOptions) {
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const isFocused = useIsFocused();

  // Refs to avoid stale closures in event callbacks
  const durationRef = useRef<number>(0);
  const onCompleteRef = useRef(onComplete);
  const hasTriggeredOnCompleteRef = useRef(false);
  const isUnmountingRef = useRef(false);

  onCompleteRef.current = onComplete;

  const videoUrl = `https://${MUX_STREAM_DOMAIN}/${playbackId}.m3u8`;

  const player = useVideoPlayer(videoUrl, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.timeUpdateEventInterval = 0.5;
    if (autoPlay) {
      videoPlayer.play();
    }
  });

  // Pause on navigation away
  useEffect(() => {
    if (!(isFocused || isUnmountingRef.current)) {
      try {
        if (player.playing) {
          player.pause();
        }
      } catch {
        // Ignore errors when player is already disposed
      }
    }
  }, [isFocused, player]);

  // Playing state changes
  const handlePlayingChange = useCallback((event: { isPlaying: boolean }) => {
    setIsPlaying(event.isPlaying);
  }, []);

  // Status changes (readyToPlay)
  const handleStatusChange = useCallback(
    (event: { status: string }) => {
      if (event.status !== "readyToPlay") {
        return;
      }
      durationRef.current = player.duration || 0;
      setIsLoading(false);
    },
    [player.duration]
  );

  // Source load — captures duration from metadata
  const handleSourceLoad = useCallback((event: { duration: number }) => {
    if (event.duration > 0) {
      durationRef.current = event.duration;
    }
  }, []);

  // Time updates — triggers onComplete in last 5 seconds
  const handleTimeUpdate = useCallback(
    (event: { currentTime: number }) => {
      const currentDuration = durationRef.current || player.duration || 0;
      if (currentDuration <= 0) {
        return;
      }

      const { currentTime } = event;
      const timeLeft = currentDuration - currentTime;

      if (!Number.isFinite(timeLeft) || timeLeft <= 0) {
        return;
      }

      // Reset flag when video loops back to start
      if (currentTime < 1 && hasTriggeredOnCompleteRef.current) {
        hasTriggeredOnCompleteRef.current = false;
      }

      if (timeLeft <= 5 && !hasTriggeredOnCompleteRef.current) {
        hasTriggeredOnCompleteRef.current = true;
        onCompleteRef.current?.();
      }
    },
    [player]
  );

  // Play-to-end event
  const handlePlayToEnd = useCallback(() => {
    onPlayToEnd?.();
  }, [onPlayToEnd]);

  // Register / clean up event subscriptions
  useEffect(() => {
    const subs = [
      player.addListener("playingChange", handlePlayingChange),
      player.addListener("statusChange", handleStatusChange),
      player.addListener("sourceLoad", handleSourceLoad),
      player.addListener("timeUpdate", handleTimeUpdate),
      player.addListener("playToEnd", handlePlayToEnd),
    ];
    return () => {
      for (const sub of subs) {
        sub?.remove();
      }
    };
  }, [
    player,
    handlePlayingChange,
    handleStatusChange,
    handleSourceLoad,
    handleTimeUpdate,
    handlePlayToEnd,
  ]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      isUnmountingRef.current = true;
      try {
        if (player?.playing) {
          player.pause();
        }
      } catch {
        // Expected during navigation disposal
      }
    },
    [player]
  );

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }, [isPlaying, player]);

  return { player, isLoading, isPlaying, togglePlayPause };
}
