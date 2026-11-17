import { useTranslation } from "@smog/i18n/react";
import {
  cn,
  IconButton,
  Logo,
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { Menu as MenuIcon, Search, X } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { MainNav, MainNavList } from "./nav";
import { GREEN_ICON_BUTTON } from "./on-green";
import { useSearchPalette } from "./search-palette-provider";
import { UserMenu } from "./user-menu";

/** The search trigger from `md`: a pill that names the `/` shortcut. */
const SEARCH_PILL =
  "relative hidden h-11 min-w-56 items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent px-4 text-sidebar-foreground text-body-sm outline-none transition duration-fast ease-standard hover:bg-sidebar-accent/80 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar motion-reduce:transition-none md:inline-flex lg:min-w-72";

/**
 * The site header on the green surface (phase 10a): the logo (reversed),
 * the sections (Gestures, My space), the search trigger (the command
 * palette, also `/`) and one user and settings menu with the language and
 * the theme. Below `md` the sections move into a sheet and the search
 * trigger shrinks to its icon.
 *
 * The page runs under the notch (`viewport-fit=cover`): the header pads
 * itself by the safe-area insets, so its green fills the strip under the
 * status bar and the browser bar above it is the same green.
 */
export function Header(): ReactNode {
  const { t } = useTranslation();
  const palette = useSearchPalette();
  // The phone menu closes when a section is chosen: the page changes under it.
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback((): void => setMenuOpen(false), []);
  return (
    <header className="sticky top-0 z-40 bg-sidebar pt-[env(safe-area-inset-top,0px)] text-sidebar-foreground">
      <div className="mx-auto flex h-16 w-full max-w-content items-center gap-2 pr-[max(--spacing(4),env(safe-area-inset-right,0px))] pl-[max(--spacing(4),env(safe-area-inset-left,0px))] md:px-6 lg:px-8">
        <Sheet onOpenChange={setMenuOpen} open={menuOpen}>
          <SheetTrigger asChild>
            <IconButton
              className={cn("md:hidden", GREEN_ICON_BUTTON)}
              icon={<MenuIcon />}
              label={t("a11y.openMenu")}
            />
          </SheetTrigger>
          {/* The phone menu on the header's green: the logo heads it, the
              sections are on-green rows. The title stays the app name for
              assistive tech; the logo inside it is decorative. */}
          <SheetContent
            className="border-sidebar-border bg-sidebar text-sidebar-foreground"
            hideClose
            side="left"
            title={
              <span className="flex min-h-touch items-center">
                <Logo decorative size="md" tone="current" />
                <span className="sr-only">{t("common.appName")}</span>
              </span>
            }
          >
            <MainNavList onGreen onNavigate={closeMenu} />
            <SheetClose asChild>
              <IconButton
                className={cn(
                  "absolute top-[calc(--spacing(3)+env(safe-area-inset-top,0px))] right-3",
                  GREEN_ICON_BUTTON
                )}
                icon={<X />}
                label={t("a11y.close")}
              />
            </SheetClose>
          </SheetContent>
        </Sheet>
        <Link
          aria-label={t("a11y.homeLink")}
          className="inline-flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
          to="/"
        >
          <Logo decorative size="md" tone="current" />
        </Link>
        <MainNav className="ml-4 hidden md:block" />
        <div className="ml-auto flex items-center gap-1">
          <button
            aria-keyshortcuts="/"
            className={SEARCH_PILL}
            onClick={palette.open}
            type="button"
          >
            <Search aria-hidden="true" className="size-5 shrink-0" />
            <span className="flex-1 text-left">{t("common.search")}</span>
            <span
              aria-hidden="true"
              className="rounded-md border border-sidebar-border px-1.5 font-medium text-caption"
            >
              /
            </span>
          </button>
          <IconButton
            aria-keyshortcuts="/"
            className={cn("md:hidden", GREEN_ICON_BUTTON)}
            icon={<Search />}
            label={t("common.search")}
            onClick={palette.open}
          />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
