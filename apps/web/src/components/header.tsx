import { Link } from "@tanstack/react-router";
import { Heart, Home, Menu, Search, Sparkles, User } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFavorites } from "@/lib/favorites-context";
import Logo from "./Logo";
import { LanguageToggle } from "./language-toggle";
import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
  const { t } = useTranslation();
  const { favoriteIds } = useFavorites();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const links = [
    { to: "/", label: t("web.navigation.home"), icon: Home },
    { to: "/gestures", label: t("web.navigation.browse"), icon: Search },
    { to: "/sponsors", label: "Sponsors", icon: Sparkles },
    { to: "/account", label: "Account", icon: User },
  ] as const;

  return (
    <header className="sticky top-0 z-50 border-border border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="container mx-auto">
        <div className="flex h-16 items-center justify-between px-4">
          {/* Logo */}
          <Link className="flex items-center" to="/">
            <Logo height={40} width={120} />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-6 md:flex">
            {links.map(({ to, label, icon: Icon }) => (
              <Link
                activeProps={{
                  className: "font-semibold",
                  style: { color: "var(--primary)" },
                }}
                className="flex items-center gap-2 text-foreground transition-colors hover:text-primary"
                key={to}
                to={to}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
            <Link
              activeProps={{
                className: "font-semibold",
                style: { color: "var(--liked)" },
              }}
              className="flex items-center gap-2 text-foreground transition-colors hover:text-primary"
              to="/favorites"
            >
              <Heart className="h-4 w-4" />
              {t("web.navigation.favorites")}
              {favoriteIds.length > 0 && (
                <span
                  className="ml-1 flex h-5 w-5 items-center justify-center rounded-full font-medium text-white text-xs"
                  style={{ backgroundColor: "var(--liked)" }}
                >
                  {favoriteIds.length}
                </span>
              )}
            </Link>
          </nav>

          {/* Right Side Actions */}
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ModeToggle />
            <UserMenu />

            {/* Mobile Menu Button */}
            <button
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              type="button"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen ? (
          <div className="border-border border-t md:hidden">
            <nav className="flex flex-col gap-2 p-4">
              {links.map(({ to, label, icon: Icon }) => (
                <Link
                  activeProps={{
                    className: "font-semibold",
                    style: { color: "var(--primary)" },
                  }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-foreground transition-colors hover:bg-muted"
                  key={to}
                  onClick={() => setMobileMenuOpen(false)}
                  to={to}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              ))}
              <Link
                activeProps={{
                  className: "font-semibold",
                  style: { color: "var(--liked)" },
                }}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-foreground transition-colors hover:bg-muted"
                onClick={() => setMobileMenuOpen(false)}
                to="/favorites"
              >
                <Heart className="h-5 w-5" />
                {t("web.navigation.favorites")}
                {favoriteIds.length > 0 && (
                  <span
                    className="ml-1 flex h-5 w-5 items-center justify-center rounded-full font-medium text-white text-xs"
                    style={{ backgroundColor: "var(--liked)" }}
                  >
                    {favoriteIds.length}
                  </span>
                )}
              </Link>
            </nav>
          </div>
        ) : null}
      </div>
    </header>
  );
}
