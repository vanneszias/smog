import { useTranslation } from "@smog/i18n/react";
import { Stack } from "expo-router";
import type { ReactElement } from "react";
import { useStackHeaderOptions } from "@/lib/header";

/** The search tab's stack: a large title, and the native search bar on iOS. */
export default function SearchLayout(): ReactElement {
  const { t } = useTranslation();
  const header = useStackHeaderOptions();
  return (
    <Stack screenOptions={header}>
      <Stack.Screen
        name="index"
        options={{ headerLargeTitle: true, title: t("nav.search") }}
      />
    </Stack>
  );
}
