import { useTranslation } from "@smog/i18n/react";
import { Stack } from "expo-router";
import type { ReactElement } from "react";
import { useStackHeaderOptions } from "@/lib/header";

/**
 * A list opened straight from a link or a cold start still has the
 * overview beneath it, so back lands there (the old app's go-back fix).
 */
export const unstable_settings = { initialRouteName: "index" };

/** The lists tab's stack: the overview (large title), then a list. */
export default function ListsLayout(): ReactElement {
  const { t } = useTranslation();
  const header = useStackHeaderOptions();
  return (
    <Stack screenOptions={header}>
      <Stack.Screen
        name="index"
        options={{ headerLargeTitle: true, title: t("nav.lists") }}
      />
      <Stack.Screen name="[id]" options={{ title: "" }} />
    </Stack>
  );
}
