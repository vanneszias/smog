import type { TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { Button, cn, ListItem } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { Hand, UserRound } from "lucide-react";
import { type MouseEvent, type ReactNode, useCallback } from "react";
import { GREEN_BUTTON } from "./on-green";

interface NavItem {
  href: string;
  icon: ReactNode;
  label: TranslationKey;
}

/**
 * The two main sections (phase 10a): the gestures and My space (favorites
 * and lists). Sponsor lives in the footer and the user menu.
 */
const NAV_ITEMS: readonly NavItem[] = [
  { href: "/gestures", icon: <Hand />, label: "nav.gestures" },
  { href: "/my", icon: <UserRound />, label: "mySpace.title" },
];

/** The header's section links, on the green surface (inline from `md`). */
export function MainNav({ className }: { className?: string }): ReactNode {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("a11y.mainNavigation")} className={className}>
      <ul className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Button asChild className={GREEN_BUTTON} variant="ghost">
              <Link to={item.href}>{t(item.label)}</Link>
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** A plain left click follows the link in this tab: only then the sheet closes. */
function closeOnPlainClick(
  event: MouseEvent<HTMLAnchorElement>,
  onNavigate: (() => void) | undefined
): void {
  if (
    event.button === 0 &&
    !(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
  ) {
    onNavigate?.();
  }
}

/** The same links as rows, for the mobile menu sheet. */
export function MainNavList({
  className,
  onNavigate,
}: {
  className?: string;
  /** Called when a link is followed (the sheet closes, the page changes). */
  onNavigate?: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const onClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) =>
      closeOnPlainClick(event, onNavigate),
    [onNavigate]
  );
  return (
    <nav
      aria-label={t("a11y.mainNavigation")}
      className={cn("-mx-6", className)}
    >
      <ul className="flex flex-col">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <ListItem asChild leading={item.icon} title={t(item.label)}>
              <Link onClick={onClick} to={item.href}>
                {t(item.label)}
              </Link>
            </ListItem>
          </li>
        ))}
      </ul>
    </nav>
  );
}
