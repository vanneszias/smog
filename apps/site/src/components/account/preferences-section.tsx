import { useAuthState } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import { Text } from "@smog/ui-web";
import type { ReactNode } from "react";
import { LanguageControl } from "@/components/app-shell/language-menu";
import { ThemeControl } from "@/components/app-shell/theme-menu";
import { AccountSection } from "./section";

function Preference({
  children,
  hint,
  label,
}: {
  children: ReactNode;
  hint?: string | undefined;
  label: string;
}): ReactNode {
  return (
    <div className="flex flex-col items-start gap-2">
      {/* The control carries the same name (`aria-label`). */}
      <Text aria-hidden="true" as="span" size="body-sm" weight="medium">
        {label}
      </Text>
      {children}
      {hint ? (
        <Text size="body-sm" tone="muted">
          {hint}
        </Text>
      ) : null}
    </div>
  );
}

/**
 * Theme and language: this browser's (cookies), for guests and users
 * alike. Signed in, the language is also the account's (`user.locale`,
 * the language of our emails): the root's `setLocale` writes it.
 */
export function PreferencesSection(): ReactNode {
  const { t } = useTranslation();
  const auth = useAuthState();
  return (
    <AccountSection title={t("settings.preferences")}>
      <Preference label={t("theme.label")}>
        <ThemeControl />
      </Preference>
      <Preference
        hint={
          auth.status === "signedIn"
            ? t("account.preferences.languageHint")
            : undefined
        }
        label={t("language.label")}
      >
        <LanguageControl />
      </Preference>
    </AccountSection>
  );
}
