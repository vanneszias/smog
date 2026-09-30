import type { TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  cn,
  IconButton,
  Sheet,
  SheetContent,
  SheetTrigger,
  Text,
} from "@smog/ui-web";
import { Link, useLocation } from "@tanstack/react-router";
import {
  FolderTree,
  Hand,
  LayoutDashboard,
  Mail,
  Menu as MenuIcon,
  ScrollText,
  Settings,
  Users,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

interface RailItem {
  /** Only the exact path is active (the dashboard). */
  exact?: boolean;
  href: string;
  icon: ReactNode;
  label: TranslationKey;
}

/** The admin sections (spec §16). Sponsorships joins in phase 6. */
const RAIL_ITEMS: readonly RailItem[] = [
  {
    exact: true,
    href: "/admin",
    icon: <LayoutDashboard />,
    label: "admin.rail.dashboard",
  },
  { href: "/admin/gestures", icon: <Hand />, label: "admin.rail.gestures" },
  {
    href: "/admin/categories",
    icon: <FolderTree />,
    label: "admin.rail.categories",
  },
  { href: "/admin/users", icon: <Users />, label: "admin.rail.users" },
  { href: "/admin/audit", icon: <ScrollText />, label: "admin.rail.audit" },
  { href: "/admin/emails", icon: <Mail />, label: "admin.rail.emails" },
  { href: "/admin/settings", icon: <Settings />, label: "admin.rail.settings" },
];

const itemClasses = cn(
  "flex min-h-touch items-center gap-3 rounded-md px-3 font-medium text-body-sm text-foreground-muted",
  "hover:bg-surface-sunken hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
  "data-[status=active]:bg-primary-subtle data-[status=active]:text-primary-strong",
  "[&_svg]:size-5 [&_svg]:shrink-0"
);

/** The rail's links; the current section is marked (`aria-current`). */
function AdminRailNav({ className }: { className?: string }): ReactNode {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("admin.rail.label")} className={className}>
      <ul className="flex flex-col gap-1">
        {RAIL_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              activeOptions={{ exact: item.exact ?? false }}
              className={itemClasses}
              to={item.href}
            >
              <span aria-hidden="true">{item.icon}</span>
              {t(item.label)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The left rail from `md`; below it, a button opening the rail in a sheet. */
export function AdminRail(): ReactNode {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  // A link in the sheet navigates; the sheet then closes.
  useEffect(() => {
    if (pathname) {
      setOpen(false);
    }
  }, [pathname]);
  return (
    <>
      <aside className="hidden w-60 shrink-0 border-border-subtle border-r bg-surface md:block">
        <div className="sticky top-16 flex flex-col gap-3 p-3">
          <Text
            as="span"
            className="px-3 pt-2"
            size="caption"
            tone="muted"
            weight="semibold"
          >
            {t("admin.rail.label")}
          </Text>
          <AdminRailNav />
        </div>
      </aside>
      <div className="flex items-center gap-2 border-border-subtle border-b px-4 py-2 md:hidden">
        <Sheet onOpenChange={setOpen} open={open}>
          <SheetTrigger asChild>
            <IconButton icon={<MenuIcon />} label={t("admin.rail.open")} />
          </SheetTrigger>
          <SheetContent side="left" title={t("admin.rail.label")}>
            <AdminRailNav />
          </SheetContent>
        </Sheet>
        <Text as="span" size="body-sm" weight="semibold">
          {t("admin.title")}
        </Text>
      </div>
    </>
  );
}
