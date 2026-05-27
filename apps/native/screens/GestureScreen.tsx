import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, SPACING } from "@smog/styles";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import {
  CategoryRow,
  ConceptSection,
  InfoSection,
  RelatedGesturesSection,
} from "@/components/gesture";
import VideoPlayer from "@/components/VideoPlayer";
import { useFavorites } from "@/context/FavoritesContext";
import { useTheme } from "@/context/ThemeContext";
import { useGesture, useRelatedGestures } from "@/hooks/useGestureData";
import { useScreenshotDetection } from "@/hooks/useScreenshotDetection";
import {
  trackCategoryPressed,
  trackEvent,
  trackGestureLiked,
  trackGestureUnliked,
  trackGestureViewed,
  trackVideoAlmostCompleted,
} from "@/services/analytics";

const GestureScreen: React.FC = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { isFavorite, toggleFavorite } = useFavorites();
  const gesture = useGesture(id);
  const relatedGestures = useRelatedGestures(id) ?? [];
  const [hasTrackedView, setHasTrackedView] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  // Mirrors the web's disclaimerFiredRef: ensures the banner shows exactly
  // once per playthrough and resets when the video loops back.
  const disclaimerFiredRef = useRef(false);

  // Enable screenshot detection for sharing gesture links
  useScreenshotDetection({
    gestureId: gesture?.id || null,
    gestureName: gesture?.name || null,
    enabled: true,
  });

  useEffect(() => {
    if (gesture) {
      trackEvent("Gesture Detail Viewed", {
        gesture_id: gesture.id,
        gesture_name: gesture.name,
        gesture_categories: gesture.category,
        categories_count: gesture.category.length,
      });

      // Track gesture viewed (only once per visit)
      if (!hasTrackedView) {
        trackGestureViewed(
          gesture.id,
          gesture.name,
          gesture.category,
          "search_results"
        );
        setHasTrackedView(true);
      }
    }
  }, [gesture, hasTrackedView]);

  const handleVideoComplete = useCallback(() => {
    if (gesture) {
      trackVideoAlmostCompleted(gesture.id, gesture.name);
    }

    // Show disclaimer once per playthrough.
    if (!disclaimerFiredRef.current) {
      disclaimerFiredRef.current = true;
      setShowDisclaimer(true);
    }
  }, [gesture]);

  if (gesture === undefined || !gesture) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  const favoriteStatus = isFavorite(gesture.id);

  const handleCategoryPress = (category: string) => {
    if (gesture) {
      trackCategoryPressed(category, "gesture_detail");
      router.dismiss();
      router.navigate({
        pathname: "/(tabs)/search",
        params: { category },
      });
    }
  };

  const handleToggleFavorite = () => {
    if (!gesture) {
      return;
    }

    const wasLiked = isFavorite(gesture.id);
    toggleFavorite(gesture.id, gesture.name);

    // Track the favorite action
    if (wasLiked) {
      trackGestureUnliked(
        gesture.id,
        gesture.name,
        gesture.category,
        "button_tap"
      );
    } else {
      trackGestureLiked(
        gesture.id,
        gesture.name,
        gesture.category,
        "button_tap"
      );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: gesture.name,
          headerBackButtonDisplayMode: "minimal",
          ...(Platform.OS === "ios"
            ? {
                // iOS: translucent blur header (liquid glass on iOS 26+)
                // The defaultScreenOptions from root layout already set
                // headerTransparent + headerBlurEffect, so we only override
                // title styling and tint to work against a blur background.
                headerTintColor: theme.primary,
                headerTitleStyle: {
                  fontWeight: "600" as const,
                  color: theme.text,
                },
              }
            : {
                // Android: opaque Material-style colored header
                headerStyle: {
                  backgroundColor: theme.primary,
                },
                headerTintColor: theme.background,
                headerTitleStyle: {
                  fontWeight: "bold" as const,
                },
              }),
          headerRight: () => (
            <TouchableOpacity
              onPress={handleToggleFavorite}
              style={styles.favoriteButton}
            >
              <Ionicons
                color={
                  favoriteStatus
                    ? theme.liked
                    : Platform.OS === "ios"
                      ? theme.primary
                      : theme.background
                }
                name={favoriteStatus ? "heart" : "heart-outline"}
                size={24}
              />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.videoContainer}>
          <VideoPlayer
            gestureId={gesture.id}
            gestureName={gesture.name}
            onComplete={handleVideoComplete}
            playbackId={gesture.playbackId}
          />
        </View>

        <DisclaimerBanner
          onDismiss={() => {
            disclaimerFiredRef.current = false;
            setShowDisclaimer(false);
          }}
          visible={showDisclaimer}
        />

        <CategoryRow
          categories={gesture.category}
          onCategoryPress={handleCategoryPress}
        />

        <InfoSection info={gesture.info} />

        <ConceptSection concepts={gesture.concept} />

        <RelatedGesturesSection relatedGestures={relatedGestures} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    padding: SPACING.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  videoContainer: {
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    overflow: "hidden",
  },
  favoriteButton: {
    paddingHorizontal: SPACING.sm,
  },
});

export default GestureScreen;
