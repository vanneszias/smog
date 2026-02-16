import { Ionicons } from "@expo/vector-icons";
import { ICON_SIZE, SPACING } from "@smog/styles";
import { Stack, useRouter } from "expo-router";
import type React from "react";
import { useCallback } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import * as DropdownMenu from "zeego/dropdown-menu";
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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
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
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger>
                      <View>
                        <Ionicons
                          color={theme.primary}
                          name="ellipsis-horizontal-circle"
                          size={ICON_SIZE.md}
                        />
                      </View>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content>
                      <DropdownMenu.Item
                        key="settings"
                        onSelect={navigateToSettings}
                      >
                        <DropdownMenu.ItemTitle>
                          {t("settings.title")}
                        </DropdownMenu.ItemTitle>
                        <DropdownMenu.ItemIcon
                          androidIconName="ic_menu_preferences"
                          ios={{ name: "gearshape" }}
                        />
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        key="about"
                        onSelect={handleAboutPress}
                      >
                        <DropdownMenu.ItemTitle>
                          {t("about.title")}
                        </DropdownMenu.ItemTitle>
                        <DropdownMenu.ItemIcon
                          androidIconName="ic_menu_info_details"
                          ios={{ name: "info.circle" }}
                        />
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        key="contact"
                        onSelect={handleContactPress}
                      >
                        <DropdownMenu.ItemTitle>
                          {t("contact.title")}
                        </DropdownMenu.ItemTitle>
                        <DropdownMenu.ItemIcon
                          androidIconName="ic_menu_call"
                          ios={{ name: "phone" }}
                        />
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
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
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger>
                      <View style={styles.androidMenuButton}>
                        <Ionicons
                          color={theme.background}
                          name="ellipsis-vertical"
                          size={ICON_SIZE.md}
                        />
                      </View>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content>
                      <DropdownMenu.Item
                        key="settings"
                        onSelect={navigateToSettings}
                      >
                        <DropdownMenu.ItemTitle>
                          {t("settings.title")}
                        </DropdownMenu.ItemTitle>
                        <DropdownMenu.ItemIcon
                          androidIconName="ic_menu_preferences"
                          ios={{ name: "gearshape" }}
                        />
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        key="about"
                        onSelect={handleAboutPress}
                      >
                        <DropdownMenu.ItemTitle>
                          {t("about.title")}
                        </DropdownMenu.ItemTitle>
                        <DropdownMenu.ItemIcon
                          androidIconName="ic_menu_info_details"
                          ios={{ name: "info.circle" }}
                        />
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        key="contact"
                        onSelect={handleContactPress}
                      >
                        <DropdownMenu.ItemTitle>
                          {t("contact.title")}
                        </DropdownMenu.ItemTitle>
                        <DropdownMenu.ItemIcon
                          androidIconName="ic_menu_call"
                          ios={{ name: "phone" }}
                        />
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                ),
              }),
        }}
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
  androidMenuButton: {
    padding: SPACING.sm,
  },
});

export default FavoritesScreen;
