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

/** The header's theme picker: an icon button with a menu of the three themes. */
export function ThemeMenu(): ReactNode {
  const { t } = useTranslation();
  const { theme } = useTheme();
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton icon={ICONS[theme]} label={t("theme.toggle")} />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{t("theme.label")}</MenuLabel>
        {THEMES.map((option) => (
          <ThemeItem key={option} option={option} />
        ))}
      </MenuContent>
    </Menu>
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
