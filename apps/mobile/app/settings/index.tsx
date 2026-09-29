import { useAuthState } from "@smog/auth/react";
import { isLocale, LOCALES } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  Avatar,
  Button,
  Field,
  Heading,
  ListItem,
  SegmentedControl,
  Select,
  useColor,
  useToast,
} from "@smog/ui-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Info from "lucide-react-native/icons/info";
import LogIn from "lucide-react-native/icons/log-in";
import Wrench from "lucide-react-native/icons/wrench";
import { type ReactElement, useCallback } from "react";
import { ScrollView, View } from "react-native";
import { useAuthClient } from "@/lib/auth-client";
import { useDevToolsUnlock } from "@/lib/dev-tools";
import { usePreferences } from "@/lib/preferences";

const THEMES = ["system", "light", "dark"] as const;
/** The language picker's "follow the device" value (`preferences.locale: null`). */
const DEVICE = "device";

function isTheme(value: string): value is (typeof THEMES)[number] {
  return (THEMES as readonly string[]).includes(value);
}

/** Settings: language, theme, the account entry and the developer tools. */
export default function SettingsScreen(): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = useAuthState();
  const client = useAuthClient();
  const { toast } = useToast();
  const muted = useColor("foregroundMuted");
  const [preferences, setPreferences] = usePreferences();
  const devTools = useDevToolsUnlock();
  const changeLocale = useCallback(
    (value: string) =>
      setPreferences({ locale: isLocale(value) ? value : null }),
    [setPreferences]
  );
  const changeTheme = useCallback(
    (value: string) => {
      if (isTheme(value)) {
        setPreferences({ theme: value });
      }
    },
    [setPreferences]
  );
  const openSignIn = useCallback(() => router.push("/sign-in"), [router]);
  const openDevTools = useCallback(
    () => router.push("/settings/developer-tools"),
    [router]
  );

  const signOut = async (): Promise<void> => {
    try {
      const { error } = await client.signOut();
      if (error) {
        throw new Error(error.message ?? error.statusText);
      }
      toast({ title: t("auth.signedOut"), variant: "success" });
    } catch (error) {
      console.error("[settings] Failed to sign out:", error);
      toast({ title: t("auth.errors.generic"), variant: "danger" });
    }
  };

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
    <ScrollView contentContainerClassName="gap-8 px-4 py-6">
      <View className="gap-4">
        <Heading level={2}>{t("settings.preferences")}</Heading>
        <Field label={t("language.label")}>
          <Select
            onValueChange={changeLocale}
            options={[
              { label: t("language.device"), value: DEVICE },
              ...LOCALES.map((locale) => ({
                label: t(`language.${locale}`),
                value: locale,
              })),
            ]}
            value={preferences.locale ?? DEVICE}
          />
        </Field>
        <Field label={t("theme.label")}>
          <SegmentedControl
            aria-label={t("theme.label")}
            onValueChange={changeTheme}
            options={THEMES.map((theme) => ({
              label: t(`theme.${theme}`),
              value: theme,
            }))}
            value={preferences.theme}
          />
        </Field>
      </View>

      <View className="gap-2">
        <Heading level={2}>{t("nav.account")}</Heading>
        {auth.user ? (
          <>
            <ListItem
              description={auth.user.email}
              leading={<Avatar name={auth.user.name} size="md" />}
              title={auth.user.name}
            />
            <Button onPress={signOut} variant="secondary">
              {t("nav.signOut")}
            </Button>
          </>
        ) : (
          <ListItem
            leading={<LogIn color={muted} />}
            onPress={openSignIn}
            title={t("nav.signIn")}
            trailing={<ChevronRight color={muted} />}
          />
        )}
      </View>

      <View className="gap-2">
        <Heading level={2}>{t("settings.about")}</Heading>
        <ListItem
          description={Constants.expoConfig?.version}
          leading={<Info color={muted} />}
          onPress={tapVersion}
          title={t("devTools.version")}
        />
        {devTools.unlocked ? (
          <ListItem
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
