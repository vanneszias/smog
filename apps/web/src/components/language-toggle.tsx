import { availableLocales } from "@smog/i18n";
import { Languages } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface LanguageMenuItemProps {
  locale: (typeof availableLocales)[number];
}

function LanguageMenuItem({ locale }: LanguageMenuItemProps) {
  const { i18n, t } = useTranslation();

  const handleSelect = useCallback((): void => {
    i18n.changeLanguage(locale).catch((error: unknown) => {
      console.error("[languageToggle] Failed to change language:", error);
    });
  }, [i18n, locale]);

  return (
    <DropdownMenuItem onSelect={handleSelect}>
      {t(`languages.${locale}`)}
      {i18n.language === locale && " ✓"}
    </DropdownMenuItem>
  );
}

export function LanguageToggle() {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="outline">
          <Languages className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">{t("web.language.toggle")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {availableLocales.map((locale) => (
          <LanguageMenuItem key={locale} locale={locale} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
