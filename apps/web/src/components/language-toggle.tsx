import { availableLocales } from "@smog/i18n";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function LanguageToggle() {
  const { i18n, t } = useTranslation();

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
          <DropdownMenuItem
            key={locale}
            onSelect={() => {
              i18n.changeLanguage(locale).catch((error: unknown) => {
                console.error(
                  "[languageToggle] Failed to change language:",
                  error
                );
              });
            }}
          >
            {t(`languages.${locale}`)}
            {i18n.language === locale && " ✓"}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
