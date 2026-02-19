import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { BORDER_RADIUS, ICON_SIZE, SPACING } from "@smog/styles";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useVideoPlayer, VideoView } from "expo-video";

const useGlass = isLiquidGlassAvailable();

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import {
  trackVideoAlmostCompleted,
  trackVideoPlaybackCompleted,
  trackVideoPlaybackPaused,
  trackVideoPlaybackStarted,
  trackVideoPlayerOpened,
} from "@/services/analyticsService";

interface VideoPlayerProps {
  playbackId: string;
  autoPlay?: boolean;
  onComplete?: () => void;
  onPlayToEnd?: () => void;
  gestureId?: string;
  gestureName?: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  playbackId,
  autoPlay = true,
  onComplete,
  onPlayToEnd,
  gestureId,
  gestureName,
}) => {
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [hasTrackedPlayerOpen, setHasTrackedPlayerOpen] = useState(false);
  const playbackStartTimeRef = useRef<number | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const isFocused = useIsFocused();
  const pausedByNavigationRef = useRef(false);
  const isUnmountingRef = useRef(false);

  // Construct MUX streaming URL
  const videoUrl = `https://stream.mux.com/${playbackId}.m3u8`;

  // Create video player instance
  const player = useVideoPlayer(videoUrl, (videoPlayer) => {
    videoPlayer.loop = true;
    if (autoPlay) {
      videoPlayer.play();
    }
  });

  // Pause video when screen loses focus (navigation away)
  useEffect(() => {
    if (!(isFocused || isUnmountingRef.current)) {
      try {
        if (player.playing) {
          pausedByNavigationRef.current = true;
          player.pause();
        }
      } catch (error) {
        console.error("[VideoPlayer] Failed to pause on focus loss:", error);
      }
    }
  }, [isFocused, player]);

  // Handle playing state changes
  const handlePlayingChange = useCallback(
    (event: { isPlaying: boolean }) => {
      const playing = event.isPlaying;
      setIsPlaying(playing);

      if (!(gestureId && gestureName)) {
        return;
      }

      if (playing) {
        trackVideoPlaybackStarted(
          gestureId,
          gestureName,
          autoPlay ? "autoplay" : "manual_play"
        );
        playbackStartTimeRef.current = Date.now();
      } else {
        // Only track user-initiated pauses, not navigation-triggered ones
        if (!pausedByNavigationRef.current) {
          const watchTime = playbackStartTimeRef.current
            ? (Date.now() - playbackStartTimeRef.current) / 1000
            : undefined;
          trackVideoPlaybackPaused(gestureId, gestureName, watchTime);
        }
        pausedByNavigationRef.current = false; // Reset flag
        playbackStartTimeRef.current = null;
      }
    },
    [gestureId, gestureName, autoPlay]
  );

  // Handle status changes
  const handleStatusChange = useCallback(
    (event: { status: string }) => {
      if (event.status !== "readyToPlay") {
        return;
      }

      setDuration(player.duration || 0);
      setIsLoading(false);

      if (!hasTrackedPlayerOpen && gestureId && gestureName) {
        trackVideoPlayerOpened(gestureId, gestureName, autoPlay);
        setHasTrackedPlayerOpen(true);
      }
    },
    [player.duration, hasTrackedPlayerOpen, gestureId, gestureName, autoPlay]
  );

  // Handle time updates
  const handleTimeUpdate = useCallback(
    (event: { currentTime: number }) => {
      if (duration <= 0) {
        return;
      }

      const timeLeft = duration - event.currentTime;
      if (timeLeft <= 5 && timeLeft > 4) {
        if (gestureId && gestureName) {
          trackVideoAlmostCompleted(gestureId, gestureName);
        }
        onComplete?.();
      }
    },
    [duration, gestureId, gestureName, onComplete]
  );

  // Handle play to end
  const handlePlayToEnd = useCallback(() => {
    if (gestureId && gestureName) {
      const watchTime = playbackStartTimeRef.current
        ? (Date.now() - playbackStartTimeRef.current) / 1000
        : undefined;
      trackVideoPlaybackCompleted(gestureId, gestureName, watchTime);
    }
    onPlayToEnd?.();
  }, [gestureId, gestureName, onPlayToEnd]);

  useEffect(() => {
    const subscription = player.addListener(
      "playingChange",
      handlePlayingChange
    );
    const statusSubscription = player.addListener(
      "statusChange",
      handleStatusChange
    );
    const timeUpdateSubscription = player.addListener(
      "timeUpdate",
      handleTimeUpdate
    );
    const playToEndSubscription = player.addListener(
      "playToEnd",
      handlePlayToEnd
    );

    return () => {
      subscription?.remove();
      statusSubscription?.remove();
      timeUpdateSubscription?.remove();
      playToEndSubscription?.remove();
    };
  }, [
    player,
    handlePlayingChange,
    handleStatusChange,
    handleTimeUpdate,
    handlePlayToEnd,
  ]);

  // Cleanup: pause video on unmount
  useEffect(() => {
    return () => {
      isUnmountingRef.current = true;
      try {
        // Only attempt to pause if the player is in a valid state
        if (player?.playing) {
          player.pause();
        }
      } catch (error) {
        // Silently handle errors during cleanup - player may already be disposed
        console.error("[VideoPlayer] Failed to pause on unmount:", error);
      }
    };
  }, [player]);

  const togglePlayPause = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  return (
    <View style={styles.container}>
      <VideoView
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        contentFit="contain"
        player={player}
        style={styles.video}
      />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : null}

      <TouchableOpacity
        onPress={togglePlayPause}
        style={[
          styles.controlButton,
          !useGlass && { backgroundColor: theme.primary },
        ]}
      >
        {useGlass && (
          <GlassView
            glassEffectStyle="regular"
            style={StyleSheet.absoluteFill}
          />
        )}
        <Ionicons
          color={useGlass ? theme.text : theme.background}
          name={isPlaying ? "pause" : "play"}
          size={ICON_SIZE.md}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 3 / 4,
    backgroundColor: "#000",
    borderRadius: BORDER_RADIUS.md,
    overflow: "hidden",
    position: "relative",
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  controlButton: {
    position: "absolute",
    bottom: SPACING.md,
    right: SPACING.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
});

export default VideoPlayer;
