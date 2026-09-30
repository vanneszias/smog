import { useAccount } from "@smog/account/client";
import { useAuthState } from "@smog/auth/react";
import { isLocale, LOCALES } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { Field, SegmentedControl, Select } from "@smog/ui-native";
import { type ReactElement, useCallback } from "react";
import { usePreferences } from "@/lib/preferences";

const THEMES = ["system", "light", "dark"] as const;
/** The language picker's "follow the device" value (`preferences.locale: null`). */
const DEVICE = "device";

function isTheme(value: string): value is (typeof THEMES)[number] {
  return (THEMES as readonly string[]).includes(value);
}

/**
 * The device's language and theme (local store; guests and users alike).
 * Signed in, the language is also the account's (`user.locale`, the
 * language of our emails), as on the site.
 */
export function PreferencesFields(): ReactElement {
  const { t } = useTranslation();
  const auth = useAuthState();
  const { updateProfile } = useAccount();
  const [preferences, setPreferences] = usePreferences();
  const signedIn = auth.status === "signedIn";
  const changeLocale = useCallback(
    (value: string) => {
      const locale = isLocale(value) ? value : null;
      setPreferences({ locale });
      if (signedIn) {
        updateProfile({ locale }).catch(() => {
          // `useAccount` logged it; the device keeps the choice.
        });
      }
    },
    [setPreferences, signedIn, updateProfile]
  );
  const changeTheme = useCallback(
    (value: string) => {
      if (isTheme(value)) {
        setPreferences({ theme: value });
      }
    },
    [setPreferences]
  );
  return (
    <>
      <Field
        hint={signedIn ? t("account.preferences.languageHint") : undefined}
        label={t("language.label")}
      >
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
    </>
  );
}
