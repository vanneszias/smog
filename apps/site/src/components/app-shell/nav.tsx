import type { TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { Button, cn, ListItem } from "@smog/ui-web";
import { Hand, Heart, HeartHandshake, List } from "lucide-react";
import type { ReactNode } from "react";

interface NavItem {
  href: string;
  icon: ReactNode;
  label: TranslationKey;
}

/**
 * The main sections. Their pages arrive in phase 3 (gestures, favorites,
 * lists) and phase 5 (sponsor), so these are plain links for now.
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
              <a href={item.href}>{t(item.label)}</a>
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
              <a href={item.href}>{t(item.label)}</a>
            </ListItem>
          </li>
        ))}
      </ul>
    </nav>
  );
}
