import { useTranslation } from "@smog/i18n/react";
import { cn } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import {
  KeyRound,
  Languages,
  ShieldCheck,
  SlidersHorizontal,
  User,
} from "lucide-react";
import type { ReactNode } from "react";

export const ACCOUNT_SECTIONS = [
  "profile",
  "sign-in",
  "preferences",
  "language",
  "privacy",
] as const;
export type AccountSectionId = (typeof ACCOUNT_SECTIONS)[number];

/** What a guest can open: the device's own settings. */
export const GUEST_SECTIONS: readonly AccountSectionId[] = [
  "preferences",
  "language",
  "privacy",
];

export function isAccountSection(value: unknown): value is AccountSectionId {
  return ACCOUNT_SECTIONS.some((section) => section === value);
}

const ICONS: Record<AccountSectionId, ReactNode> = {
  language: <Languages aria-hidden />,
  preferences: <SlidersHorizontal aria-hidden />,
  privacy: <ShieldCheck aria-hidden />,
  profile: <User aria-hidden />,
  "sign-in": <KeyRound aria-hidden />,
};

const LABEL_KEYS = {
  language: "account.nav.language",
  preferences: "account.nav.preferences",
  privacy: "account.nav.privacy",
  profile: "account.nav.profile",
  "sign-in": "account.nav.signIn",
} as const satisfies Record<AccountSectionId, string>;

/**
 * The settings navigation: a column from `md`, a scrolling row of pills
 * below it. One section shows at a time (`?section=`); each entry is a real
 * link, so the keyboard and the back button work.
 */
export function AccountNav({
  current,
  sections,
}: {
  current: AccountSectionId;
  sections: readonly AccountSectionId[];
}): ReactNode {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("account.nav.label")}
      className="-mx-4 overflow-x-auto px-4 md:mx-0 md:w-56 md:shrink-0 md:overflow-visible md:px-0"
    >
      <ul className="flex gap-2 md:flex-col md:gap-1">
        {sections.map((section) => {
          const active = section === current;
          return (
            <li className="shrink-0" key={section}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-touch items-center gap-2 rounded-full px-4 font-medium text-body-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring md:rounded-lg [&_svg]:size-4",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-muted hover:bg-accent/60 hover:text-foreground"
                )}
                search={{ section }}
                to="/account"
              >
                {ICONS[section]}
                {t(LABEL_KEYS[section])}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
