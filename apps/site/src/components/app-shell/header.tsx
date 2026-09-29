import { useTranslation } from "@smog/i18n/react";
import {
  IconButton,
  Logo,
  Sheet,
  SheetContent,
  SheetTrigger,
  Text,
} from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { Menu as MenuIcon, Search } from "lucide-react";
import type { ReactNode } from "react";
import { LanguageControl, LanguageMenu } from "./language-menu";
import { MainNav, MainNavList } from "./nav";
import { ThemeControl, ThemeMenu } from "./theme-menu";
import { UserMenu } from "./user-menu";

/** Search lives on /gestures (phase 3), a full page load for now. */
function openSearch(): void {
  window.location.assign("/gestures");
}

/**
 * The site header: logo, sections, search, language, theme and the account
 * entry. Below `md` the sections, language and theme move into a sheet.
 */
export function Header(): ReactNode {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-40 border-border-subtle border-b bg-background">
      <div className="mx-auto flex h-16 w-full max-w-content items-center gap-2 px-4 md:px-6 lg:px-8">
        <Sheet>
          <SheetTrigger asChild>
            <IconButton
              className="md:hidden"
              icon={<MenuIcon />}
              label={t("a11y.openMenu")}
            />
          </SheetTrigger>
          <SheetContent side="left" title={t("common.appName")}>
            <MainNavList />
            <div className="flex flex-col gap-2">
              <Text as="span" size="body-sm" tone="muted" weight="medium">
                {t("language.label")}
              </Text>
              <LanguageControl />
            </div>
            <div className="flex flex-col gap-2">
              <Text as="span" size="body-sm" tone="muted" weight="medium">
                {t("theme.label")}
              </Text>
              <ThemeControl />
            </div>
          </SheetContent>
        </Sheet>
        <Link
          className="inline-flex min-h-touch items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          to="/"
        >
          <Logo size="sm" tone="primary" />
        </Link>
        <MainNav className="ml-4 hidden md:block" />
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            icon={<Search />}
            label={t("common.search")}
            onClick={openSearch}
          />
          <div className="hidden items-center gap-1 md:flex">
            <LanguageMenu />
            <ThemeMenu />
          </div>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
