import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";

export default function TabLayout() {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textLight,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          borderTopWidth: Platform.OS === "ios" ? 0.5 : 1,
          paddingBottom: Platform.OS === "ios" ? 20 : 8,
          height: Platform.OS === "ios" ? 90 : 60,
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
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              color={color}
              name={focused ? "home" : "home-outline"}
              size={Platform.OS === "ios" ? (focused ? size + 2 : size) : size}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="search"
        options={{
          title: t("tabs.search"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              color={color}
              name={focused ? "search" : "search-outline"}
              size={Platform.OS === "ios" ? (focused ? size + 2 : size) : size}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="favorites"
        options={{
          title: t("tabs.favorites"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              color={color}
              name={focused ? "heart" : "heart-outline"}
              size={Platform.OS === "ios" ? (focused ? size + 2 : size) : size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
