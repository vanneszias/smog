import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import UserMenu from "@/components/user-menu";
import Logo from "./Logo";
import { LanguageToggle } from "./language-toggle";
import { ModeToggle } from "./mode-toggle";

export default function Header() {
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === t("accessibility.keys.escape", "Escape")) {
        setSidebarOpen(false);
      }
    };

    if (sidebarOpen) {
      document.addEventListener("keydown", handleEscape);
      // Prevent body scroll when sidebar is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [sidebarOpen, t]);

  // Top header navigation - only key actions
  const headerLinks = [
    { to: "/favorites", label: t("web.header.favorites", "Favorieten") },
    { to: "/sponsors", label: t("web.header.sponsor", "Sponsor") },
  ];

  // Sidebar navigation - all pages
  const sidebarLinks = [
    { to: "/gestures", label: t("web.header.search", "Zoek") },
    { to: "/favorites", label: t("web.header.favorites", "Favorieten") },
    { to: "/account", label: t("web.header.account", "Account") },
    { to: "/sponsors", label: t("web.header.sponsor", "Sponsor") },
  ];

  return (
    <>
      <header className="sticky top-0 z-[60] bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex items-center justify-between px-6 py-6 pt-6 lg:px-12">
          {/* Logo */}
          <Link className="shrink-0" to="/">
            <Logo />
          </Link>

          <div className="flex flex-row items-center gap-4">
            {/* Desktop Navigation - Only key actions */}
            <nav className="hidden items-center gap-6 xl:flex">
              {headerLinks.map((link) => (
                <Link
                  className="text-primary hover:underline"
                  key={link.to}
                  to={link.to}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* User Menu - Desktop only */}
            <div className="hidden xl:block">
              <UserMenu />
            </div>

            {/* CTA Button - Desktop only */}
            <Link
              className="hidden items-center rounded-full bg-primary px-6 py-3 text-sm text-white uppercase transition-all hover:bg-primary/90 xl:inline-flex"
              to="/gestures"
            >
              {t("web.header.discoverGestures", "Ontdek de SMOG-gebaren")}
            </Link>

            {/* Menu Toggle Button - Always visible */}
            <button
              aria-expanded={sidebarOpen}
              aria-label={
                sidebarOpen
                  ? t("accessibility.menu.close", "Close menu")
                  : t("accessibility.menu.open", "Open menu")
              }
              className={`relative flex h-12 w-12 scale-75 items-center justify-center rounded-full bg-white shadow-lg transition-all duration-300 hover:scale-100 ${
                sidebarOpen
                  ? "border-2 border-primary"
                  : "border-2 border-transparent"
              }`}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              type="button"
            >
              <svg
                aria-hidden="true"
                className="h-6 w-6"
                fill="none"
                strokeLinecap="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  className={`origin-center transition-all duration-300 ${
                    sidebarOpen
                      ? "translate-y-0 rotate-45 stroke-primary"
                      : "-translate-y-1.5 rotate-0 stroke-black"
                  }`}
                  d="M5 12h14"
                />
                <path
                  className={`origin-center transition-all duration-300 ${
                    sidebarOpen
                      ? "stroke-primary opacity-0"
                      : "stroke-black opacity-100"
                  }`}
                  d="M5 12h14"
                />
                <path
                  className={`origin-center transition-all duration-300 ${
                    sidebarOpen
                      ? "translate-y-0 -rotate-45 stroke-primary"
                      : "translate-y-1.5 rotate-0 stroke-black"
                  }`}
                  d="M5 12h14"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Backdrop overlay - click to dismiss */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity duration-300 ${
          sidebarOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Full Screen Sidebar - Slides from top on mobile, right on desktop */}
      <aside
        className={`fixed inset-0 z-50 flex flex-col bg-sidebar transition-transform duration-500 ease-out md:left-auto md:w-[500px] ${
          sidebarOpen
            ? "translate-x-0 translate-y-0"
            : "-translate-y-full md:translate-x-full md:translate-y-0"
        }`}
      >
        {/* Sidebar Navigation */}
        <div className="flex flex-1 flex-col justify-center overflow-y-auto pt-20 md:pt-0">
          <nav className="flex max-w-2xl flex-col gap-4 px-6 md:gap-6 md:px-0 md:pl-24">
            {sidebarLinks.map((link, index) => (
              <Link
                className="text-center font-normal text-2xl text-primary hover:underline md:text-left md:text-4xl"
                key={link.to}
                onClick={() => setSidebarOpen(false)}
                style={{
                  animation: sidebarOpen
                    ? `slideIn 0.5s ease-out ${index * 0.1}s both`
                    : "none",
                }}
                to={link.to}
              >
                {link.label}
              </Link>
            ))}
            <Link
              className="mt-4 inline-flex items-center justify-center self-center rounded-full bg-primary px-6 py-3 text-sm text-white uppercase transition-all hover:scale-105 hover:bg-primary/90 md:mt-8 md:self-start md:px-8 md:py-4 md:text-lg"
              onClick={() => setSidebarOpen(false)}
              style={{
                animation: sidebarOpen
                  ? `slideIn 0.5s ease-out ${sidebarLinks.length * 0.1}s both`
                  : "none",
              }}
              to="/gestures"
            >
              {t("web.header.discoverGestures", "Ontdek de SMOG-gebaren")}
            </Link>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="bottom-0 mb-6 flex shrink-0 flex-col gap-3 px-6 md:mb-8 md:gap-4 md:px-0 md:pl-24">
          {/* User Menu - Mobile only */}
          <div className="flex justify-center md:justify-start xl:hidden">
            <UserMenu />
          </div>

          {/* Theme and Language Toggles */}
          <div className="flex items-center justify-center gap-3 md:justify-start">
            <ModeToggle />
            <LanguageToggle />
          </div>

          {/* Footer Links */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-center text-muted-foreground text-sm md:justify-start">
            <Link
              className="hover:text-primary hover:underline"
              onClick={() => setSidebarOpen(false)}
              to="/terms"
            >
              {t("web.footer.terms", "Voorwaarden")}
            </Link>
            <span>•</span>
            <Link
              className="hover:text-primary hover:underline"
              onClick={() => setSidebarOpen(false)}
              to="/privacy"
            >
              {t("web.footer.privacy", "Privacy")}
            </Link>
          </div>

          {/* Credits */}
          <div className="flex justify-center text-center text-muted-foreground text-sm md:justify-start">
            <a
              className="hover:text-primary hover:underline"
              href="https://zias.be"
              rel="noopener noreferrer"
              target="_blank"
            >
              Gemaakt met ♡ door zias.be
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}
