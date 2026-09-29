import { useTranslation } from "@smog/i18n/react";
import { useColor } from "@smog/ui-native";
import { Stack } from "expo-router";
import type { ReactElement } from "react";
import { devToolsAvailable } from "@/lib/dev-tools";

/** The settings stack: settings, then the developer tools (dev and staging). */
export default function SettingsLayout(): ReactElement {
  const { t } = useTranslation();
  const background = useColor("background");
  const foreground = useColor("foreground");
  const primary = useColor("primary");
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: background },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: background },
        headerTintColor: primary,
        headerTitleStyle: { color: foreground },
      }}
    >
      <Stack.Screen name="index" options={{ title: t("settings.title") }} />
      <Stack.Protected guard={devToolsAvailable()}>
        <Stack.Screen
          name="developer-tools/index"
          options={{ title: t("devTools.title") }}
        />
        <Stack.Screen
          name="developer-tools/gallery"
          options={{ title: t("devTools.componentGallery") }}
        />
      </Stack.Protected>
    </Stack>
  );
}
