import { useTranslation } from "@smog/i18n/react";
import { MenuGroup, MenuItem, MenuLabel, SegmentedControl } from "@smog/ui-web";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { isTheme, THEMES, type Theme } from "@/lib/preferences";
import { useTheme } from "@/lib/theme";

const ICONS: Record<Theme, ReactNode> = {
  dark: <Moon />,
  light: <Sun />,
  system: <Monitor />,
};

function ThemeItem({ option }: { option: Theme }): ReactNode {
  const { t } = useTranslation();
  const { setTheme, theme } = useTheme();
  const select = useCallback(() => setTheme(option), [option, setTheme]);
  const checked = option === theme;
  return (
    <MenuItem
      aria-checked={checked}
      icon={checked ? <Check /> : ICONS[option]}
      onSelect={select}
      role="menuitemradio"
    >
      {t(`theme.${option}`)}
    </MenuItem>
  );
}

/** The theme radio items for a menu (system, light, dark). */
export function ThemeMenuItems(): ReactNode {
  const { t } = useTranslation();
  return (
    <MenuGroup>
      <MenuLabel>{t("theme.label")}</MenuLabel>
      {THEMES.map((option) => (
        <ThemeItem key={option} option={option} />
      ))}
    </MenuGroup>
  );
}

/** The same choice as a segmented control (the mobile menu sheet). */
export function ThemeControl(): ReactNode {
  const { t } = useTranslation();
  const { setTheme, theme } = useTheme();
  const change = useCallback(
    (value: string) => {
      if (isTheme(value)) {
        setTheme(value);
      }
    },
    [setTheme]
  );
  return (
    <SegmentedControl
      aria-label={t("theme.label")}
      onValueChange={change}
      options={THEMES.map((option) => ({
        icon: ICONS[option],
        label: t(`theme.${option}`),
        value: option,
      }))}
      value={theme}
    />
  );
}
