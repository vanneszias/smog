import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, ICON_SIZE, SPACING } from "@smog/styles";
import { useVideoPlayer, VideoView } from "expo-video";
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

type VideoPlayerProps = {
  playbackId: string;
  autoPlay?: boolean;
  onComplete?: () => void;
  gestureId?: string;
  gestureName?: string;
};

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  playbackId,
  autoPlay = true,
  onComplete,
  gestureId,
  gestureName,
}) => {
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [hasTrackedPlayerOpen, setHasTrackedPlayerOpen] = useState(false);
  const playbackStartTimeRef = useRef<number | null>(null);
  const [duration, setDuration] = useState<number>(0);

  // Construct MUX streaming URL
  const videoUrl = `https://stream.mux.com/${playbackId}.m3u8`;

  // Create video player instance
  const player = useVideoPlayer(videoUrl, (player) => {
    player.loop = true;
    if (autoPlay) {
      player.play();
    }
  });

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
        const watchTime = playbackStartTimeRef.current
          ? (Date.now() - playbackStartTimeRef.current) / 1000
          : undefined;
        trackVideoPlaybackPaused(gestureId, gestureName, watchTime);
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
    if (!(gestureId && gestureName)) {
      return;
    }

    const watchTime = playbackStartTimeRef.current
      ? (Date.now() - playbackStartTimeRef.current) / 1000
      : undefined;
    trackVideoPlaybackCompleted(gestureId, gestureName, watchTime);
  }, [gestureId, gestureName]);

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

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      )}

      <TouchableOpacity
        onPress={togglePlayPause}
        style={[styles.controlButton, { backgroundColor: theme.primary }]}
      >
        <Ionicons
          color={theme.background}
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
  },
});

export default VideoPlayer;
