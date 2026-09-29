import { isLocale, LOCALES, type Locale } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuTrigger,
  SegmentedControl,
} from "@smog/ui-web";
import { Check, Languages } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { useLocale } from "@/lib/locale";

function LanguageItem({ option }: { option: Locale }): ReactNode {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  const select = useCallback(() => setLocale(option), [option, setLocale]);
  const checked = option === locale;
  return (
    <MenuItem
      aria-checked={checked}
      icon={checked ? <Check /> : <span />}
      lang={option}
      onSelect={select}
      role="menuitemradio"
    >
      {t(`language.${option}`)}
    </MenuItem>
  );
}

/** The header's language picker. Each language is named in itself. */
export function LanguageMenu(): ReactNode {
  const { t } = useTranslation();
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton icon={<Languages />} label={t("language.toggle")} />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{t("language.label")}</MenuLabel>
        {LOCALES.map((option) => (
          <LanguageItem key={option} option={option} />
        ))}
      </MenuContent>
    </Menu>
  );
}

/** The same choice as a segmented control (the mobile menu sheet). */
export function LanguageControl(): ReactNode {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  const change = useCallback(
    (value: string) => {
      if (isLocale(value)) {
        setLocale(value);
      }
    },
    [setLocale]
  );
  return (
    <SegmentedControl
      aria-label={t("language.label")}
      onValueChange={change}
      options={LOCALES.map((option) => ({
        label: t(`language.${option}`),
        value: option,
      }))}
      value={locale}
    />
  );
}
