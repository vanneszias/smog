import { FONT_SIZE, FONT_WEIGHT, SPACING } from "@smog/styles";
import { useRouter } from "expo-router";
import type React from "react";
import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import HomeScreenBottomSheetButton from "@/components/bottom-sheet/HomeScreenBottomSheetButton";
import OptionsBottomSheet from "@/components/bottom-sheet/OptionsBottomSheet";
import SearchResults from "@/components/search/SearchResults";
import { useFavorites } from "@/context/FavoritesContext";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import { useBottomSheet } from "@/hooks/useBottomSheet";
import { useSettingsModal } from "@/hooks/useSettingsModal";
import {
  trackBottomSheetClosed,
  trackBottomSheetOpened,
} from "@/services/analyticsService";
import type { Gesture } from "@/types";

// TODO: when the user clicks on heart, make the gesture card go away more slowly. (or maybe add swipe animations/gestures?)

const FavoritesScreen: React.FC = () => {
  const router = useRouter();
  const { theme } = useTheme();
  const { favoriteGestures, toggleFavorite, isFavorite } = useFavorites();
  const { t } = useTranslation();

  const {
    isVisible: isModalVisible,
    showBottomSheet: showHomeScreenModal,
    hideBottomSheet: hideHomeScreenModal,
  } = useBottomSheet();

  // This hook provides the action handlers for the modal buttons
  const { handleSettingsPress, handleAboutPress, handleContactPress } =
    useSettingsModal();

  const handleGesturePress = useCallback(
    (gesture: Gesture) => {
      router.push(`/gestures/${gesture.id}`);
    },
    [router]
  );

  const navigateToSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  // Track bottom sheet interactions
  const handleBottomSheetOpen = useCallback(() => {
    trackBottomSheetOpened("options");
    showHomeScreenModal();
  }, [showHomeScreenModal]);

  const handleBottomSheetClose = useCallback(() => {
    trackBottomSheetClosed("options");
    hideHomeScreenModal();
  }, [hideHomeScreenModal]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.topBar}>
        <HomeScreenBottomSheetButton onPress={handleBottomSheetOpen} />
        <View style={styles.absoluteTitleContainer}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {t("tabs.favorites")}
          </Text>
        </View>
      </View>

      <OptionsBottomSheet
        onAboutPress={handleAboutPress}
        onClose={handleBottomSheetClose}
        onContactPress={handleContactPress}
        onSettingsPress={() => handleSettingsPress(navigateToSettings)}
        visible={isModalVisible}
      />

      <SearchResults
        isFavorite={isFavorite}
        isLoading={false}
        onGesturePress={handleGesturePress}
        onToggleFavorite={toggleFavorite}
        results={favoriteGestures}
        source="favorites_screen"
        style={styles.resultList}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    position: "relative",
  },
  absoluteTitleContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  headerTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    textAlign: "center",
  },
  resultList: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
});

export default FavoritesScreen;
