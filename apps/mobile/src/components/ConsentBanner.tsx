import { Banner, Button, Text } from "@smog/ui-native";
import { openBrowserAsync } from "expo-web-browser";
import { Pressable, View } from "react-native";
import { setConsent, useConsent } from "@/lib/consent";
import { t, useLocale } from "@/lib/i18n";
import { privacyPolicyUrl } from "@/lib/site";

/**
 * The analytics prompt: non-blocking, unlike `apps/native`'s full-screen
 * modal. A prompt standing between a person and the privacy policy it links
 * to is the pattern regulators single out (spec, "Decisions taken
 * 2026-09-22"; Stage 8.5 Ruling 11 for the web).
 *
 * Renders nothing until the stored answer has loaded, so a returning person
 * never sees a flash of a question they already answered.
 */
export function useConsentBannerVisible(): boolean {
  const { consent, loaded } = useConsent();
  return loaded && consent === null;
}

export function ConsentBanner() {
  const visible = useConsentBannerVisible();
  const { locale } = useLocale();

  if (!visible) {
    return null;
  }

  return (
    <Banner label={t("settings.analyticsPromptTitle")}>
      <Text variant="heading">{t("settings.analyticsPromptTitle")}</Text>
      <Text variant="muted">{t("settings.analyticsPromptDescription")}</Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => openBrowserAsync(privacyPolicyUrl(locale))}
        testID="consent-privacy"
      >
        <Text className="underline">{t("settings.privacyPolicy")}</Text>
      </Pressable>
      <View className="flex-row gap-sm">
        <Button onPress={() => setConsent("granted")} testID="consent-allow">
          {t("settings.analyticsAllow")}
        </Button>
        <Button
          onPress={() => setConsent("denied")}
          testID="consent-required-only"
          variant="secondary"
        >
          {t("settings.analyticsRequiredOnly")}
        </Button>
      </View>
    </Banner>
  );
}
