import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";

export default function TabLayout() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const TAB_BAR_BASE_HEIGHT = Platform.OS === "ios" ? 50 : 52;
  // On iOS, the Tabs navigator natively handles the bottom safe area.
  // Only apply the inset manually on Android.
  const bottomInset = Platform.OS === "android" ? insets.bottom : 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textLight,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          borderTopWidth: Platform.OS === "ios" ? 0.5 : 1,
          paddingBottom: Platform.OS === "ios" ? 0 : bottomInset || 8,
          height:
            Platform.OS === "ios"
              ? undefined
              : TAB_BAR_BASE_HEIGHT + bottomInset,
          ...Platform.select({
            ios: {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -1 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
            },
            android: {
              elevation: 8,
            },
          }),
        },
        tabBarLabelStyle: {
          fontSize: Platform.OS === "ios" ? 12 : 11,
          fontWeight: Platform.OS === "ios" ? "500" : "400",
        },
        tabBarIconStyle: {
          marginTop: Platform.OS === "ios" ? 0 : 2,
        },
        headerShown: false,
        tabBarHideOnKeyboard: Platform.OS === "android",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.home"),
          tabBarIcon: ({ color, size, focused }) => {
            let iconSize = size;
            if (Platform.OS === "ios" && focused) {
              iconSize = size + 2;
            }
            return (
              <Ionicons
                color={color}
                name={focused ? "home" : "home-outline"}
                size={iconSize}
              />
            );
          },
        }}
      />

      <Tabs.Screen
        name="search"
        options={{
          title: t("tabs.search"),
          tabBarIcon: ({ color, size, focused }) => {
            let iconSize = size;
            if (Platform.OS === "ios" && focused) {
              iconSize = size + 2;
            }
            return (
              <Ionicons
                color={color}
                name={focused ? "search" : "search-outline"}
                size={iconSize}
              />
            );
          },
        }}
      />

      <Tabs.Screen
        name="favorites"
        options={{
          title: t("tabs.favorites"),
          tabBarIcon: ({ color, size, focused }) => {
            let iconSize = size;
            if (Platform.OS === "ios" && focused) {
              iconSize = size + 2;
            }
            return (
              <Ionicons
                color={color}
                name={focused ? "heart" : "heart-outline"}
                size={iconSize}
              />
            );
          },
        }}
      />
    </Tabs>
  );
}
