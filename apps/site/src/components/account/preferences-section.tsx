import { useTranslation } from "@smog/i18n/react";
import { Text } from "@smog/ui-web";
import type { ReactNode } from "react";
import { LanguageControl } from "@/components/app-shell/language-menu";
import { ThemeControl } from "@/components/app-shell/theme-menu";
import { AccountSection } from "./section";

function Preference({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}): ReactNode {
  return (
    <div className="flex flex-col items-start gap-2">
      {/* The control carries the same name (`aria-label`). */}
      <Text aria-hidden="true" as="span" size="body-sm" weight="medium">
        {label}
      </Text>
      {children}
    </div>
  );
}

/** Theme and language: this browser's (cookies), for guests and users alike. */
export function PreferencesSection(): ReactNode {
  const { t } = useTranslation();
  return (
    <AccountSection title={t("settings.preferences")}>
      <Preference label={t("theme.label")}>
        <ThemeControl />
      </Preference>
      <Preference label={t("language.label")}>
        <LanguageControl />
      </Preference>
    </AccountSection>
  );
}
