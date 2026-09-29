import { useTranslation } from "@smog/i18n/react";
import { Stack } from "expo-router";
import type { ReactElement } from "react";
import { devToolsAvailable } from "@/lib/dev-tools";
import { useStackHeaderOptions } from "@/lib/header";

/** The settings stack: settings, then the developer tools (dev and staging). */
export default function SettingsLayout(): ReactElement {
  const { t } = useTranslation();
  const header = useStackHeaderOptions();
  return (
    <Stack screenOptions={header}>
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
