/**
 * @fileoverview VideoPlayer component for gesture video playback.
 *
 * A full-width video player that:
 * - Streams from MUX via HLS
 * - Triggers `onComplete` callback 5 seconds before the video ends
 * - Pauses automatically when the screen loses focus
 * - Tracks playback analytics via PostHog (see `useVideoAnalytics`)
 * - Renders a play/pause button with optional Liquid Glass effect
 *
 * Logic is split across two hooks:
 * - `useVideoPlayerState` — player instance, event subscriptions, state
 * - `useVideoAnalytics`   — PostHog event tracking
 *
 * @example
 * <VideoPlayer
 *   playbackId="abc123"
 *   gestureId={gesture.id}
 *   gestureName={gesture.name}
 *   onComplete={handleComplete}
 * />
 */

import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, ICON_SIZE, SPACING } from "@smog/styles";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { VideoView } from "expo-video";
import type React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useVideoPlayerState } from "./video/useVideoPlayerState";

const useGlass = isLiquidGlassAvailable();

interface VideoPlayerProps {
  /** MUX playback ID for the gesture video. */
  playbackId: string;
  /** Whether to start playing immediately. Defaults to `true`. */
  autoPlay?: boolean;
  /** Called when the video reaches the last 5 seconds (triggers once per loop). */
  onComplete?: () => void;
  /** Called when the video plays to its end. */
  onPlayToEnd?: () => void;
  /** Gesture ID for analytics tracking. */
  gestureId?: string;
  /** Gesture name for analytics tracking. */
  gestureName?: string;
}

/**
 * MUX HLS video player with analytics, focus handling, and Liquid Glass UI.
 */
const VideoPlayer: React.FC<VideoPlayerProps> = ({
  playbackId,
  autoPlay = true,
  onComplete,
  onPlayToEnd,
  gestureId,
  gestureName,
}) => {
  const { theme } = useTheme();
  const { player, isLoading, isPlaying, togglePlayPause } = useVideoPlayerState(
    {
      playbackId,
      autoPlay,
      gestureId,
      gestureName,
      onComplete,
      onPlayToEnd,
    }
  );

  return (
    <View style={styles.container}>
      <VideoView
        allowsPictureInPicture={false}
        contentFit="contain"
        fullscreenOptions={{ enable: false }}
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
