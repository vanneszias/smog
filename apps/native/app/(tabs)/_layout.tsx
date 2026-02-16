import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Icon,
  Label,
  NativeTabs,
  VectorIcon,
} from "expo-router/unstable-native-tabs";
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
      labelStyle={{ color: theme.textLight }}
      minimizeBehavior="onScrollDown"
      tintColor={theme.primary}
    >
      <NativeTabs.Trigger name="index">
        <Label>{t("tabs.home")}</Label>
        <Icon
          androidSrc={{
            default: <VectorIcon family={Ionicons} name="home-outline" />,
            selected: <VectorIcon family={Ionicons} name="home" />,
          }}
          sf={{ default: "house", selected: "house.fill" }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search" role="search">
        <Label>{t("tabs.search")}</Label>
        <Icon
          androidSrc={<VectorIcon family={Ionicons} name="search-outline" />}
          sf="magnifyingglass"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="favorites">
        <Label>{t("tabs.favorites")}</Label>
        <Icon
          androidSrc={{
            default: <VectorIcon family={Ionicons} name="heart-outline" />,
            selected: <VectorIcon family={Ionicons} name="heart" />,
          }}
          sf={{ default: "heart", selected: "heart.fill" }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
