import { useTranslation } from "@smog/i18n/react";
import { IconButton } from "@smog/ui-native";
import { Stack, useRouter } from "expo-router";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import { type ReactElement, useCallback } from "react";
import { HeaderActions } from "@/components/header-actions";
import { devToolsAvailable } from "@/lib/dev-tools";
import { useStackHeaderOptions } from "@/lib/header";

/**
 * Settings is a stack of its own pushed on the root stack, whose header is
 * hidden, so its first screen has no native back button: this one leaves
 * settings (back to where it was opened, or home when it was opened with
 * nothing beneath). The screens pushed inside settings keep the native back
 * button, and the root stack keeps the swipe back.
 */
function SettingsBack(): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const leave = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, [router]);
  return (
    <HeaderActions>
      <IconButton
        icon={<ChevronLeft />}
        label={t("common.back")}
        onPress={leave}
        testID="settings-back"
        variant="ghost"
      />
    </HeaderActions>
  );
}

const settingsBack = (): ReactElement => <SettingsBack />;

/** The settings stack: settings, the account, then the developer tools (dev and staging). */
export default function SettingsLayout(): ReactElement {
  const { t } = useTranslation();
  const header = useStackHeaderOptions();
  return (
    <Stack screenOptions={header}>
      <Stack.Screen
        name="index"
        options={{ headerLeft: settingsBack, title: t("settings.title") }}
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
