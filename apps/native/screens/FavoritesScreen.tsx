import { Ionicons } from "@expo/vector-icons";
import { FONT_SIZE, SPACING } from "@smog/styles";
import { Stack, useRouter } from "expo-router";
import type React from "react";
import { useCallback } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { HeaderMenuButton } from "@/components/common";
import SearchResults from "@/components/search/SearchResults";
import { useFavorites } from "@/context/FavoritesContext";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import type { Gesture } from "@/types";

const FavoritesScreen: React.FC = () => {
  const router = useRouter();
  const { theme } = useTheme();
  const { favoriteGestures, toggleFavorite, isFavorite } = useFavorites();
  const { t } = useTranslation();

  const handleGesturePress = useCallback(
    (gesture: Gesture) => {
      router.push(`/gestures/${gesture.id}`);
    },
    [router]
  );

  const navigateToSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const handleAboutPress = useCallback(() => {
    Linking.openURL("https://smog.vlaanderen");
  }, []);

  const handleContactPress = useCallback(() => {
    Linking.openURL("mailto:hello@smog.vlaanderen");
  }, []);

  const isIOS = Platform.OS === "ios";

  const menuActions = [
    {
      id: "settings",
      title: t("settings.title"),
      image: Platform.select({
        ios: "gearshape",
        android: "ic_menu_preferences",
      }),
    },
    {
      id: "about",
      title: t("about.title"),
      image: Platform.select({
        ios: "info.circle",
        android: "ic_menu_info_details",
      }),
    },
    {
      id: "contact",
      title: t("contact.title"),
      image: Platform.select({
        ios: "phone",
        android: "ic_menu_call",
      }),
    },
  ];

  const handleMenuAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      if (nativeEvent.event === "settings") {
        navigateToSettings();
      }
      if (nativeEvent.event === "about") {
        handleAboutPress();
      }
      if (nativeEvent.event === "contact") {
        handleContactPress();
      }
    },
    [navigateToSettings, handleAboutPress, handleContactPress]
  );

  return (
    <View
      collapsable={false}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen
        options={{
          title: t("tabs.favorites"),
          ...(isIOS
            ? {
                headerLargeTitle: true,
                headerLargeTitleStyle: {
                  color: theme.text,
                },
                headerStyle: {
                  backgroundColor: theme.background,
                },
                headerTransparent: true,
                headerBlurEffect: "systemChromeMaterial",
                headerShadowVisible: false,
                headerRight: () => (
                  <HeaderMenuButton
                    actions={menuActions}
                    onPressAction={(event) =>
                      handleMenuAction({ nativeEvent: { event } })
                    }
                  />
                ),
              }
            : {
                headerStyle: {
                  backgroundColor: theme.primary,
                },
                headerTintColor: theme.background,
                headerTitleStyle: {
                  fontWeight: "bold",
                  fontSize: 20,
                },
                headerRight: () => (
                  <HeaderMenuButton
                    actions={menuActions}
                    onPressAction={(event) =>
                      handleMenuAction({ nativeEvent: { event } })
                    }
                  />
                ),
              }),
        }}
      />

      {favoriteGestures.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            color={theme.textLight}
            name="heart-outline"
            size={64}
            style={styles.emptyIcon}
          />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            {t("favorites.emptyTitle")}
          </Text>
          <Text style={[styles.emptyMessage, { color: theme.textLight }]}>
            {t("favorites.emptyMessage")}
          </Text>
        </View>
      ) : (
        <SearchResults
          isFavorite={isFavorite}
          isLoading={false}
          onGesturePress={handleGesturePress}
          onToggleFavorite={toggleFavorite}
          results={favoriteGestures}
          source="favorites_screen"
          style={styles.resultList}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  resultList: {
    paddingHorizontal: SPACING.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
  },
  emptyIcon: {
    marginBottom: SPACING.lg,
    opacity: 0.4,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: "600",
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  emptyMessage: {
    fontSize: FONT_SIZE.md,
    textAlign: "center",
    lineHeight: 22,
  },
});

export default FavoritesScreen;
