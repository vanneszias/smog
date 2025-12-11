import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useNavigation } from "@react-navigation/native";
import { BORDER_RADIUS, SPACING } from "@smog/styles";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CategoryRow,
  ConceptSection,
  InfoSection,
  RelatedGesturesSection,
} from "@/components/gesture";
import VideoPlayer from "@/components/VideoPlayer";
import { useFavorites } from "@/context/FavoritesContext";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useTranslation } from "@/context/TranslationContext";
import {
  trackCategoryPressed,
  trackEvent,
  trackGestureLiked,
  trackGestureUnliked,
  trackGestureViewed,
  trackVideoAlmostCompleted,
} from "@/services/analyticsService";
import gestureService from "@/services/gestureService";
import type { Gesture } from "@/types";

const GestureScreen: React.FC = () => {
  const _router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [relatedGestures, setRelatedGestures] = useState<Gesture[]>([]);
  const lastToastTimeRef = useRef<number>(0);
  const [hasTrackedView, setHasTrackedView] = useState(false);

  useEffect(() => {
    if (id) {
      const loadGesture = async () => {
        setIsLoading(true);
        try {
          const result = await gestureService.getGesturesByIds([id]);
          if (result.length > 0) {
            const gestureData = result[0];
            setGesture(gestureData);

            // Supplement autocapture with gesture-specific properties
            // Screen tracking is handled automatically by PostHog autocapture
            trackEvent("Gesture Detail Viewed", {
              gesture_id: gestureData.id,
              gesture_name: gestureData.name,
              gesture_categories: gestureData.category,
              categories_count: gestureData.category.length,
            });
          }
        } catch (error) {
          console.error(error);
        } finally {
          setIsLoading(false);
        }
      };

      loadGesture();
    }
  }, [id]);

  useEffect(() => {
    if (gesture) {
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

      const fetchRelated = async () => {
        let related: Gesture[] = [];
        for (const category of gesture.category) {
          const gesturesInCategory =
            await gestureService.getGesturesByCategory(category);
          related = related.concat(gesturesInCategory);
        }
        // Remove duplicates and the current gesture
        const uniqueRelated = Array.from(
          new Map(
            related.filter((g) => g.id !== gesture.id).map((g) => [g.id, g])
          ).values()
        ).slice(0, 5);
        setRelatedGestures(uniqueRelated);
      };
      fetchRelated();
    }
  }, [gesture, hasTrackedView]);

  if (isLoading || !gesture) {
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
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [
            {
              name: "(tabs)",
              state: {
                routes: [
                  {
                    name: "search",
                    params: { category },
                  },
                ],
              },
            },
          ],
        })
      );
    }
  };

  const getInfoToastMessage = () => {
    const messages = [
      t("gesture.videoComplete.1"),
      t("gesture.videoComplete.2"),
      t("gesture.videoComplete.3"),
      t("gesture.videoComplete.4"),
      t("gesture.videoComplete.5"),
      t("gesture.videoComplete.6"),
      t("gesture.videoComplete.7"),
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  };

  const handleVideoComplete = () => {
    if (gesture) {
      trackVideoAlmostCompleted(gesture.id, gesture.name);
    }

    const now = Date.now();
    // Prevent showing multiple toasts within 10 seconds
    if (now - lastToastTimeRef.current < 10_000) {
      return;
    }

    lastToastTimeRef.current = now;
    showToast({
      message: getInfoToastMessage(),
      type: "info",
      duration: 5000,
    });
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
          toggleFavorite(gesture.id, gesture.name);
          // Track the undo action
          if (wasLiked) {
            trackGestureLiked(
              gesture.id,
              gesture.name,
              gesture.category,
              "undo"
            );
          } else {
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
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen
        options={{
          title: gesture.name,
          headerStyle: {
            backgroundColor: theme.primary,
          },
          headerBackButtonDisplayMode: "minimal",
          headerTintColor: theme.background,
          headerTitleStyle: {
            fontWeight: "bold",
          },
          headerRight: () => (
            <TouchableOpacity
              onPress={handleToggleFavorite}
              style={styles.favoriteButton}
            >
              <Ionicons
                color={favoriteStatus ? theme.error : theme.background}
                name={favoriteStatus ? "heart" : "heart-outline"}
                size={24}
              />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.videoContainer}>
          <VideoPlayer
            gestureId={gesture.id}
            gestureName={gesture.name}
            onComplete={handleVideoComplete}
            playbackId={gesture.playbackId}
          />
        </View>

        <CategoryRow
          categories={gesture.category}
          onCategoryPress={handleCategoryPress}
        />

        <InfoSection info={gesture.info} />

        <ConceptSection concepts={gesture.concept} />

        <RelatedGesturesSection relatedGestures={relatedGestures} />
      </ScrollView>
    </SafeAreaView>
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
