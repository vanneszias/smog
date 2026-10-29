import { useAuthState } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import { Avatar, Heading, ListItem, useColor, useToast } from "@smog/ui-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import GraduationCap from "lucide-react-native/icons/graduation-cap";
import Info from "lucide-react-native/icons/info";
import LogIn from "lucide-react-native/icons/log-in";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import Wrench from "lucide-react-native/icons/wrench";
import { type ReactElement, useCallback } from "react";
import { ScrollView, View } from "react-native";
import { AnalyticsSwitch, openPrivacy } from "@/components/consent-sheet";
import { PreferencesFields } from "@/components/preferences-fields";
import { useLessonAccess } from "@/lessons/lesson-gate";
import { useDevToolsUnlock } from "@/lib/dev-tools";
import { SCREEN_CONTENT_CLASS_NAME, SCREEN_SCROLL_OPTIONS } from "@/lib/screen";

/**
 * Settings: language, theme, analytics, the account entry and the
 * developer tools.
 */
export default function SettingsScreen(): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = useAuthState();
  const { toast } = useToast();
  const muted = useColor("mutedForeground");
  const devTools = useDevToolsUnlock();
  const teacher = useLessonAccess() === "allowed";
  const openAccount = useCallback(
    () => router.push("/settings/account"),
    [router]
  );
  const openLessons = useCallback(
    () => router.push("/settings/lessons"),
    [router]
  );
  const openSignIn = useCallback(() => router.push("/sign-in"), [router]);
  const openDevTools = useCallback(
    () => router.push("/settings/developer-tools"),
    [router]
  );

  const tapVersion = (): void => {
    if (devTools.unlocked) {
      return;
    }
    const remaining = devTools.tap();
    if (remaining === 0) {
      toast({ title: t("devTools.unlocked"), variant: "success" });
    } else if (remaining < 4) {
      toast({ title: t("devTools.unlockHint", { count: remaining }) });
    }
  };

  return (
    <ScrollView
      {...SCREEN_SCROLL_OPTIONS}
      contentContainerClassName={`${SCREEN_CONTENT_CLASS_NAME} gap-8 px-4`}
      testID="settings-screen"
    >
      <View className="gap-4">
        <Heading level={2}>{t("settings.preferences")}</Heading>
        <PreferencesFields />
      </View>

      <View className="gap-2">
        <Heading level={2}>{t("account.privacy.title")}</Heading>
        <AnalyticsSwitch />
        <ListItem
          className="px-0"
          leading={<ShieldCheck color={muted} />}
          onPress={openPrivacy}
          title={t("account.privacy.policy")}
          trailing={<ChevronRight color={muted} />}
        />
      </View>

      <View className="gap-2">
        <Heading level={2}>{t("nav.account")}</Heading>
        {auth.user ? (
          <ListItem
            className="px-0"
            description={auth.user.email}
            leading={<Avatar name={auth.user.name} size="md" />}
            onPress={openAccount}
            title={auth.user.name}
            trailing={<ChevronRight color={muted} />}
          />
        ) : (
          <ListItem
            className="px-0"
            leading={<LogIn color={muted} />}
            onPress={openSignIn}
            title={t("nav.signIn")}
            trailing={<ChevronRight color={muted} />}
          />
        )}
      </View>

      {teacher ? (
        <View className="gap-2">
          <Heading level={2}>{t("teacherLessons.title")}</Heading>
          <ListItem
            className="px-0"
            description={t("teacherLessons.entryDescription")}
            leading={<GraduationCap color={muted} />}
            onPress={openLessons}
            testID="settings-lessons"
            title={t("teacherLessons.title")}
            trailing={<ChevronRight color={muted} />}
          />
        </View>
      ) : null}

      <View className="gap-2">
        <Heading level={2}>{t("settings.about")}</Heading>
        <ListItem
          className="px-0"
          description={Constants.expoConfig?.version}
          leading={<Info color={muted} />}
          onPress={tapVersion}
          title={t("devTools.version")}
        />
        {devTools.unlocked ? (
          <ListItem
            className="px-0"
            leading={<Wrench color={muted} />}
            onPress={openDevTools}
            title={t("devTools.title")}
            trailing={<ChevronRight color={muted} />}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}
