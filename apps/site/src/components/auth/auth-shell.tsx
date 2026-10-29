import { CONTACT_EMAIL } from "@smog/config/constants";
import { useTranslation } from "@smog/i18n/react";
import {
  AuthSidePanel,
  Button,
  IconButton,
  Menu,
  MenuContent,
  MenuSeparator,
  MenuTrigger,
  TextLink,
} from "@smog/ui-web";
import { Link, useMatches } from "@tanstack/react-router";
import { ArrowLeft, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { LanguageMenuItems } from "@/components/app-shell/language-menu";
import { ThemeMenuItems } from "@/components/app-shell/theme-menu";

/**
 * Whether the current route asked for the auth shell
 * (`staticData: { authShell: true }`). The routes that do: `/sign-in`,
 * `/sign-up`, `/forgot-password`, `/reset-password`, `/verify-email`,
 * `/magic-link` and `/magic-link/app`, every page that renders `AuthPage`.
 */
export function useAuthShell(): boolean {
  return useMatches({
    select: (matches) =>
      matches.some((match) => match.staticData.authShell === true),
  });
}

/** Language and theme, the guest half of the site header's settings menu. */
function SettingsMenu(): ReactNode {
  const { t } = useTranslation();
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton icon={<Settings />} label={t("nav.settings")} />
      </MenuTrigger>
      <MenuContent className="max-h-(--radix-dropdown-menu-content-available-height) min-w-60 overflow-y-auto">
        <LanguageMenuItems />
        <MenuSeparator />
        <ThemeMenuItems />
      </MenuContent>
    </Menu>
  );
}

/** A legal link with a 44 px target; plain anchors, as in the site footer. */
function LegalLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}): ReactNode {
  return (
    <TextLink
      className="inline-flex min-h-touch items-center"
      href={href}
      tone="muted"
    >
      {children}
    </TextLink>
  );
}

/**
 * The full-screen frame of the auth pages, instead of the site header and
 * footer: from `md` the green brand panel beside the form column; below it
 * the form alone. The column keeps a slim header (back to the website, the
 * settings menu) and footer (the legal links), so the page still has one
 * banner, one main and one contentinfo. Nothing is fixed to the viewport
 * height: a short or narrow screen scrolls the whole page.
 */
export function AuthShell({ children }: { children: ReactNode }): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:grid-cols-2">
      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="flex items-center justify-between gap-2 px-2 py-2 md:px-6 md:py-4">
          {/* Wraps instead of pushing the settings off a narrow, spaced screen. */}
          <Button
            asChild
            className="min-w-0 shrink whitespace-normal text-left"
            variant="ghost"
          >
            <Link to="/">
              <ArrowLeft aria-hidden="true" className="size-5 shrink-0" />
              {t("shell.backToSite")}
            </Link>
          </Button>
          <SettingsMenu />
        </header>
        <main
          className="flex flex-1 flex-col items-center px-4 pt-4 pb-8 md:justify-center md:px-8 md:py-12"
          id="main"
          tabIndex={-1}
        >
          {children}
        </main>
        <footer className="px-4 pb-4 md:px-8">
          <nav aria-label={t("nav.legal")}>
            <ul className="flex flex-wrap justify-center gap-x-6 text-body-sm">
              <li>
                <LegalLink href="/privacy">{t("nav.privacy")}</LegalLink>
              </li>
              <li>
                <LegalLink href="/terms">{t("nav.terms")}</LegalLink>
              </li>
              <li>
                <LegalLink href={`mailto:${CONTACT_EMAIL}`}>
                  {t("nav.contact")}
                </LegalLink>
              </li>
            </ul>
          </nav>
        </footer>
      </div>
      {/* After the column in the source (read after the page), first on screen. */}
      <AuthSidePanel
        className="md:order-first"
        description={t("home.intro")}
        tagline={t("home.tagline")}
      />
    </div>
  );
}
