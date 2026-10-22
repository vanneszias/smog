import { type LanguageInfo, languageCodes } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { MenuGroup, MenuItem, MenuLabel, SegmentedControl } from "@smog/ui-web";
import { Check } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { useLocale } from "@/lib/locale";

function LanguageItem({ option }: { option: LanguageInfo }): ReactNode {
  const { locale, setLocale } = useLocale();
  const select = useCallback(
    () => setLocale(option.code),
    [option.code, setLocale]
  );
  const checked = option.code === locale;
  return (
    <MenuItem
      aria-checked={checked}
      icon={checked ? <Check /> : <span />}
      lang={option.code}
      onSelect={select}
      role="menuitemradio"
    >
      {option.name}
    </MenuItem>
  );
}

/**
 * The language radio items for a menu: the enabled languages (`language`
 * rows, in their order), each named in itself.
 */
export function LanguageMenuItems(): ReactNode {
  const { t } = useTranslation();
  const { languages } = useLocale();
  return (
    <MenuGroup>
      <MenuLabel>{t("language.label")}</MenuLabel>
      {languages.map((option) => (
        <LanguageItem key={option.code} option={option} />
      ))}
    </MenuGroup>
  );
}

/** The same choice as a segmented control (the mobile menu sheet). */
export function LanguageControl(): ReactNode {
  const { t } = useTranslation();
  const { languages, locale, setLocale } = useLocale();
  const change = useCallback(
    (value: string) => {
      if (languageCodes(languages).includes(value)) {
        setLocale(value);
      }
    },
    [languages, setLocale]
  );
  return (
    <SegmentedControl
      aria-label={t("language.label")}
      onValueChange={change}
      options={languages.map((option) => ({
        label: option.name,
        value: option.code,
      }))}
      value={locale}
    />
  );
}
