import Ionicons from "@expo/vector-icons/Ionicons";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";

export default function TabLayout() {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <NativeTabs
      backgroundColor={Platform.OS === "ios" ? "transparent" : theme.card}
      blurEffect={Platform.OS === "ios" ? "systemChromeMaterial" : undefined}
      disableTransparentOnScrollEdge
      labelStyle={{ color: theme.textLight }}
      minimizeBehavior="onScrollDown"
      tintColor={theme.primary}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t("tabs.home")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "house", selected: "house.fill" }}
          src={{
            default: (
              <NativeTabs.Trigger.VectorIcon
                family={Ionicons}
                name="home-outline"
              />
            ),
            selected: (
              <NativeTabs.Trigger.VectorIcon family={Ionicons} name="home" />
            ),
          }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search" role="search">
        <NativeTabs.Trigger.Label>{t("tabs.search")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="magnifyingglass"
          src={
            <NativeTabs.Trigger.VectorIcon
              family={Ionicons}
              name="search-outline"
            />
          }
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="favorites">
        <NativeTabs.Trigger.Label>
          {t("tabs.favorites")}
        </NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "heart", selected: "heart.fill" }}
          src={{
            default: (
              <NativeTabs.Trigger.VectorIcon
                family={Ionicons}
                name="heart-outline"
              />
            ),
            selected: (
              <NativeTabs.Trigger.VectorIcon family={Ionicons} name="heart" />
            ),
          }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
