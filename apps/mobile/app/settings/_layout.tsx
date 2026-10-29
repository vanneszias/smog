import { useTranslation } from "@smog/i18n/react";
import { IconButton } from "@smog/ui-native";
import { Stack, useRouter } from "expo-router";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import type { ReactElement } from "react";
import { useCallback } from "react";
import { HeaderActions } from "@/components/header-actions";
import { devToolsAvailable } from "@/lib/dev-tools";
import { useStackHeaderOptions } from "@/lib/header";

/** The settings stack: settings, the account, then the developer tools (dev and staging). */
export default function SettingsLayout(): ReactElement {
  const { t } = useTranslation();
  const header = useStackHeaderOptions();
  const router = useRouter();
  const back = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, [router]);
  const headerLeft = useCallback(
    () => (
      <HeaderActions>
        <IconButton
          icon={<ChevronLeft />}
          label={t("common.back")}
          onPress={back}
          variant="ghost"
        />
      </HeaderActions>
    ),
    [back, t]
  );
  return (
    <Stack screenOptions={header}>
      <Stack.Screen
        name="index"
        options={{ headerLeft, title: t("settings.title") }}
      />
      <Stack.Screen name="account" options={{ title: t("account.title") }} />
      <Stack.Screen
        name="lessons/index"
        options={{ title: t("teacherLessons.title") }}
      />
      <Stack.Screen
        name="lessons/[id]"
        options={{ title: t("teacherLessons.title") }}
      />
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
