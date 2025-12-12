import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, ICON_SIZE, SHADOWS, SPACING } from "@smog/styles";
import { ImpactFeedbackStyle, impactAsync } from "expo-haptics";
import { useEffect, useImperativeHandle, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useTranslation } from "@/context/TranslationContext";
import {
  trackFavoriteAdded,
  trackFavoriteRemoved,
  trackFavoriteUndoAction,
  trackGestureLiked,
  trackGestureUnliked,
} from "@/services/analyticsService";
import type { Gesture } from "@/types";
import { typography } from "@/utils/typography";

type GestureCardProps = {
  gesture: Gesture;
  onPress: (gesture: Gesture) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (gestureId: string) => void;
  source?: "search_results" | "favorites_screen" | "related_gestures";
};

export type GestureCardRef = {
  close: () => void;
};

const GestureCard = ({
  gesture,
  onPress,
  isFavorite = false,
  onToggleFavorite,
  source = "search_results",
  ref,
}: GestureCardProps & { ref?: React.Ref<GestureCardRef> }) => {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const { t } = useTranslation();

  // Animation values for like feedback
  const scale = useSharedValue(1);
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);

  // Track taps for double tap detection
  const lastTapRef = useRef<number>(0);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useImperativeHandle(ref, () => ({
    close: () => {
      // Reset animations
      scale.value = 1;
      heartScale.value = 0;
      heartOpacity.value = 0;
      // Clear any pending timeouts
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
    },
  }));

  // Cleanup timeout on unmount
  useEffect(
    () => () => {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
    },
    []
  );

  const handleLike = () => {
    if (onToggleFavorite) {
      impactAsync(ImpactFeedbackStyle.Medium);

      const wasLiked = isFavorite;
      onToggleFavorite(gesture.id);

      // Track the favorite action
      if (wasLiked) {
        trackFavoriteRemoved(
          gesture.id,
          gesture.name,
          gesture.category,
          source
        );
        trackGestureUnliked(
          gesture.id,
          gesture.name,
          gesture.category,
          "button_tap"
        );
      } else {
        trackFavoriteAdded(gesture.id, gesture.name, gesture.category, source);
        trackGestureLiked(
          gesture.id,
          gesture.name,
          gesture.category,
          "button_tap"
        );
      }

      // Show toast with undo functionality
      const message = wasLiked ? t("favorites.removed") : t("favorites.added");

      showToast({
        message,
        type: wasLiked ? "info" : "success",
        duration: 3000,
        action: {
          label: t("favorites.undo"),
          onPress: () => {
            // Undo the favorite toggle
            onToggleFavorite(gesture.id);
            // Track the undo action
            if (wasLiked) {
              trackFavoriteUndoAction(gesture.id, gesture.name, "undo_remove");
              trackGestureLiked(
                gesture.id,
                gesture.name,
                gesture.category,
                "undo"
              );
            } else {
              trackFavoriteUndoAction(gesture.id, gesture.name, "undo_add");
              trackGestureUnliked(
                gesture.id,
                gesture.name,
                gesture.category,
                "undo"
              );
            }
          },
        },
      });
    }
  };

  const handleLikeButtonPress = () => {
    handleLike();
    showLikeAnimation();
  };

  const showLikeAnimation = () => {
    // Animate heart appearance with a more pronounced effect
    heartScale.value = withSequence(
      withSpring(1.3, { damping: 8, stiffness: 150 }),
      withSpring(1, { damping: 12, stiffness: 250 })
    );
    heartOpacity.value = withSequence(
      withTiming(1, { duration: 150 }),
      withTiming(0, { duration: 900 })
    );

    // Animate card scale for feedback - use timing for more predictable behavior
    scale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withTiming(1, { duration: 200 })
    );
  };

  const handleCardPress = () => {
    const now = Date.now();
    const timeDiff = now - lastTapRef.current;

    if (timeDiff < 300) {
      // Double tap detected
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      if (onToggleFavorite) {
        // Track double tap interaction
        const wasLiked = isFavorite;
        if (!wasLiked) {
          trackGestureLiked(
            gesture.id,
            gesture.name,
            gesture.category,
            "double_tap"
          );
        }
        handleLike();
        showLikeAnimation();
      }
    } else {
      // Single tap - wait to see if there's a second tap
      lastTapRef.current = now;
      tapTimeoutRef.current = setTimeout(() => {
        onPress(gesture);
        tapTimeoutRef.current = null;
      }, 300);
    }
  };

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const animatedHeartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartOpacity.value,
  }));

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity activeOpacity={0.8} onPress={handleCardPress}>
        <Animated.View
          style={[
            styles.container,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
            },
            SHADOWS.medium,
            animatedCardStyle,
          ]}
        >
          <View style={styles.cardContent}>
            <View style={styles.textContainer}>
              <Text
                style={[
                  typography.subtitle,
                  { color: theme.text, marginBottom: 0 },
                ]}
              >
                {gesture.name}
              </Text>
              <Text style={[typography.bodySmall, { color: theme.textLight }]}>
                {gesture.category.join(", ")}
              </Text>
              {gesture.concept?.length ? (
                <Text style={[typography.caption, { color: theme.textLight }]}>
                  {gesture.concept.join(", ")}
                </Text>
              ) : null}
              {gesture.info ? (
                <Text style={[typography.caption, { color: theme.textLight }]}>
                  {gesture.info}
                </Text>
              ) : null}
            </View>
          </View>

          {onToggleFavorite ? (
            <TouchableOpacity
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={handleLikeButtonPress}
              style={styles.favoriteButton}
            >
              <Ionicons
                color={isFavorite ? theme.liked : theme.primary}
                name={isFavorite ? "heart" : "heart-outline"}
                size={ICON_SIZE.md}
              />
            </TouchableOpacity>
          ) : null}

          {/* Like animation overlay */}
          <Animated.View
            pointerEvents="none"
            style={[styles.heartOverlay, animatedHeartStyle]}
          >
            <View
              style={[
                styles.heartContainer,
                { backgroundColor: theme.background },
              ]}
            >
              <Ionicons
                color={theme.liked}
                name={isFavorite ? "heart" : "heart-outline"}
                size={ICON_SIZE.xl}
              />
            </View>
          </Animated.View>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: SPACING.xs,
    position: "relative",
  },
  container: {
    flexDirection: "row",
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    overflow: "hidden",
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
  },
  textContainer: {
    display: "flex",
    flexDirection: "column",
    gap: SPACING.xs,
  },
  favoriteButton: {
    padding: SPACING.sm,
    marginLeft: SPACING.sm,
  },
  heartOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  heartContainer: {
    width: ICON_SIZE.xl + SPACING.lg,
    height: ICON_SIZE.xl + SPACING.lg,
    borderRadius: BORDER_RADIUS.round,
    justifyContent: "center",
    alignItems: "center",
    ...SHADOWS.large,
  },
});

export default GestureCard;
