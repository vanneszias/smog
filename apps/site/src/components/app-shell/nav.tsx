import type { TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { Button, cn, ListItem } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { Hand, Heart, HeartHandshake, List } from "lucide-react";
import type { ReactNode } from "react";

interface NavItem {
  href: string;
  icon: ReactNode;
  label: TranslationKey;
}

/**
 * The main sections, as router links. Sponsor arrives in phase 5 (until
 * then it is the not-found page).
 */
const NAV_ITEMS: readonly NavItem[] = [
  { href: "/gestures", icon: <Hand />, label: "nav.gestures" },
  { href: "/favorites", icon: <Heart />, label: "nav.favorites" },
  { href: "/lists", icon: <List />, label: "nav.lists" },
  { href: "/sponsor", icon: <HeartHandshake />, label: "nav.sponsor" },
];

/** The header's section links (inline from `md`). */
export function MainNav({ className }: { className?: string }): ReactNode {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("a11y.mainNavigation")} className={className}>
      <ul className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Button asChild variant="ghost">
              <Link to={item.href}>{t(item.label)}</Link>
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The same links as rows, for the mobile menu sheet. */
export function MainNavList({ className }: { className?: string }): ReactNode {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("a11y.mainNavigation")}
      className={cn("-mx-6", className)}
    >
      <ul className="flex flex-col">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <ListItem asChild leading={item.icon} title={t(item.label)}>
              <Link to={item.href}>{t(item.label)}</Link>
            </ListItem>
          </li>
        ))}
      </ul>
    </nav>
  );
}
