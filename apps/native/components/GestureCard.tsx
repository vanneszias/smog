import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, ICON_SIZE, SHADOWS, SPACING } from "@smog/styles";
import { ImpactFeedbackStyle, impactAsync } from "expo-haptics";
import { memo, useEffect, useImperativeHandle, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/context/ThemeContext";
import type { Gesture } from "@/types";
import { typography } from "@/utils/typography";

interface GestureCardProps {
  gesture: Gesture;
  onPress: (gesture: Gesture) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (gestureId: string) => void;
}

export interface GestureCardRef {
  close: () => void;
}

const GestureCard = ({
  gesture,
  onPress,
  isFavorite = false,
  onToggleFavorite,
  ref,
}: GestureCardProps & { ref?: React.Ref<GestureCardRef> }) => {
  const { theme } = useTheme();

  // Animation values for like feedback
  const scale = useSharedValue(1);
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);

  // Track taps for double tap detection
  const lastTapRef = useRef<number>(0);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      onToggleFavorite(gesture.id);
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
                name={isFavorite ? "checkmark" : "add"}
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
                color={isFavorite ? theme.liked : theme.primary}
                name={isFavorite ? "checkmark" : "add"}
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

/**
 * Memoised export — prevents unnecessary re-renders when the parent
 * (e.g. a FlatList) re-renders but the gesture data and callbacks haven't changed.
 *
 * The comparison is shallow by default. Because `gesture` is an object, the
 * parent should avoid creating new gesture references on each render (use
 * `useMemo` or stable references from the gesture service).
 */
export default memo(GestureCard);
