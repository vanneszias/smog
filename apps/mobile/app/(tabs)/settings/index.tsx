import { availableLocales } from "@smog/i18n";
import { Button, Card, Text } from "@smog/ui-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useColorScheme } from "nativewind";
import { Pressable, View } from "react-native";
import { API_BASE_URL } from "@/lib/api";
import { t, useLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { signOut, useSession } from "@/lib/session";

/**
 * Every option this screen offers is one press, with nothing destructive on
 * it — that lives on `account.tsx`, reached through {@link ManageAccount}
 * below. Language and theme both write straight through: there is no "save"
 * step, because neither can be undone into a bad state the way a password
 * or a delete can.
 */

type ThemeOption = "system" | "light" | "dark";
const THEME_OPTIONS: ThemeOption[] = ["system", "light", "dark"];

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
  const { colorScheme, setColorScheme } = useColorScheme();
  // NativeWind's own hook answers `undefined` for "follow the system" —
  // there is no third value it returns for that. This screen needs one, to
  // know which of the three options is selected, and treats "no override"
  // as its own state instead of guessing from `colorScheme`.
  const active: ThemeOption = colorScheme ?? "system";

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
            onPress={() => setColorScheme(option)}
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
