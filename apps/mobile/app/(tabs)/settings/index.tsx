import { availableLocales } from "@smog/i18n";
import { Button, Card, Switch, Text } from "@smog/ui-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Pressable, View } from "react-native";
import { API_BASE_URL } from "@/lib/api";
import { setConsent, useConsent } from "@/lib/consent";
import { t, useLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { signOut, useSession } from "@/lib/session";
import { privacyPolicyUrl } from "@/lib/site";
import { type ThemePreference, useThemePreference } from "@/lib/theme";

/**
 * Every option this screen offers is one press, with nothing destructive on
 * it — that lives on `account.tsx`, reached through {@link ManageAccount}
 * below. Language and theme both write straight through: there is no "save"
 * step, because neither can be undone into a bad state the way a password
 * or a delete can.
 */

const THEME_OPTIONS: ThemePreference[] = ["system", "light", "dark"];

function LanguageRow() {
  const { locale, setLocale } = useLocale();

  return (
    <Card className="gap-sm p-md">
      <Text variant="heading">{t("settings.language")}</Text>
      <View className="flex-row flex-wrap gap-sm">
        {availableLocales.map((option) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: option === locale }}
            className={
              option === locale
                ? "rounded-md bg-primary px-md py-sm"
                : "rounded-md border border-border px-md py-sm"
            }
            key={option}
            onPress={() => setLocale(option as Locale)}
            testID={`language-${option}`}
          >
            <Text
              className={option === locale ? "text-primary-foreground" : ""}
            >
              {t(`languages.${option}`)}
            </Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

function ThemeRow() {
  // The choice, not NativeWind's `colorScheme`: that is the scheme in
  // effect, always "light" or "dark", so it can never select "system" (see
  // `lib/theme.ts`).
  const { preference: active, setPreference } = useThemePreference();

  return (
    <Card className="gap-sm p-md">
      <Text variant="heading">{t("settings.theme")}</Text>
      <View className="flex-row flex-wrap gap-sm">
        {THEME_OPTIONS.map((option) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: option === active }}
            className={
              option === active
                ? "rounded-md bg-primary px-md py-sm"
                : "rounded-md border border-border px-md py-sm"
            }
            key={option}
            onPress={() => setPreference(option)}
            testID={`theme-${option}`}
          >
            <Text
              className={option === active ? "text-primary-foreground" : ""}
            >
              {t(`settings.${option}`)}
            </Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

/**
 * The only place, guest or signed in, to change an analytics decision once
 * `ConsentBanner` has stopped asking: that banner renders nothing once
 * `consent` is no longer `null`, so without a control here the first answer
 * would otherwise be final (the web account page closes the same gap).
 */
function AnalyticsRow() {
  const { consent, loaded } = useConsent();
  const { locale } = useLocale();

  return (
    <Card className="gap-sm p-md">
      <View className="flex-row items-center justify-between gap-md">
        <View className="flex-1">
          <Text variant="heading">{t("settings.analyticsTitle")}</Text>
          <Text variant="muted">{t("settings.analyticsDescription")}</Text>
        </View>
        <Switch
          disabled={!loaded}
          label={t("settings.analyticsTitle")}
          onValueChange={(next) => setConsent(next ? "granted" : "denied")}
          value={consent === "granted"}
        />
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() => WebBrowser.openBrowserAsync(privacyPolicyUrl(locale))}
        testID="settings-privacy"
      >
        <Text className="underline">{t("settings.privacyPolicy")}</Text>
      </Pressable>
    </Card>
  );
}

export default function SettingsScreen() {
  const { user } = useSession();
  const { locale } = useLocale();

  const onSignOut = async () => {
    await signOut();
    router.replace("/(auth)/sign-in");
  };

  const onOpenSponsor = () => {
    // Leaves the app deliberately — see this screen's own label. The
    // sponsor flow is `apps/site`'s own page, the same origin `API_BASE_URL`
    // already points requests at, not a separate marketing domain.
    WebBrowser.openBrowserAsync(`${API_BASE_URL}/${locale}/sponsor`);
  };

  return (
    <View className="flex-1 gap-md bg-background p-lg">
      <Text size="xl" variant="heading">
        {t("settings.title")}
      </Text>

      <LanguageRow />
      <ThemeRow />
      <AnalyticsRow />

      {user === null ? null : (
        <Button
          onPress={() => router.push("/(tabs)/settings/account")}
          testID="manage-account"
          variant="secondary"
        >
          {t("settings.manageAccount")}
        </Button>
      )}

      {user === null ? null : (
        <Button onPress={onSignOut} testID="sign-out" variant="outline">
          {t("account.logout")}
        </Button>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={onOpenSponsor}
        testID="sponsor-link"
      >
        <Text variant="muted">{t("settings.sponsorLink")}</Text>
      </Pressable>
    </View>
  );
}
