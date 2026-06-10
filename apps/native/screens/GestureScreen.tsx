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
import DisclaimerBanner from "@/components/DisclaimerBanner";
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
import { trackAnalyticsEvent } from "@/lib/openpanel";

const GestureScreen: React.FC = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { isFavorite, toggleFavorite } = useFavorites();
  const gesture = useGesture(id);
  const relatedGestures = useRelatedGestures(id) ?? [];
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

  const gestureId = gesture?.id;

  useEffect(() => {
    if (gestureId) {
      trackAnalyticsEvent("gesture_viewed", {
        gesture_id: gestureId,
        source: "direct",
      });
    }
  }, [gestureId]);

  const handleVideoComplete = useCallback(() => {
    // Show disclaimer once per playthrough.
    if (!disclaimerFiredRef.current) {
      disclaimerFiredRef.current = true;
      setShowDisclaimer(true);
    }
  }, []);

  const handleVideoPlayToEnd = useCallback(() => {
    if (gesture) {
      trackAnalyticsEvent("video_playback_completed", {
        gesture_id: gesture.id,
      });
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

    toggleFavorite(gesture.id, gesture.name, "gesture_detail");
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
                name={favoriteStatus ? "checkmark" : "add"}
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
            onComplete={handleVideoComplete}
            onPlayToEnd={handleVideoPlayToEnd}
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
