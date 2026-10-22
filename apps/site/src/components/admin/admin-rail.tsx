import type { TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  Sheet,
  SheetContent,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@smog/ui-web";
import { Link, useLocation } from "@tanstack/react-router";
import {
  ChevronDown,
  FolderTree,
  Hand,
  HandCoins,
  LayoutDashboard,
  Mail,
  MailWarning,
  ScrollText,
  Settings,
  Users,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

interface RailItem {
  href: string;
  icon: ReactNode;
  label: TranslationKey;
}

interface RailGroup {
  id: string;
  items: readonly RailItem[];
  label: TranslationKey;
}

/** The dashboard, above the groups. */
const DASHBOARD: RailItem = {
  href: "/admin",
  icon: <LayoutDashboard />,
  label: "admin.rail.dashboard",
};

/**
 * The admin sections (spec 1 §16, phase 10a): Content, Community and
 * Operations. The groups of the translation screens (spec 2) and the teacher
 * area (spec 3) are added here later, shown by role.
 */
export const RAIL_GROUPS: readonly RailGroup[] = [
  {
    id: "content",
    items: [
      { href: "/admin/gestures", icon: <Hand />, label: "admin.rail.gestures" },
      {
        href: "/admin/categories",
        icon: <FolderTree />,
        label: "admin.rail.categories",
      },
    ],
    label: "admin.rail.groups.content",
  },
  {
    id: "community",
    items: [
      { href: "/admin/users", icon: <Users />, label: "admin.rail.users" },
      {
        href: "/admin/sponsorships",
        icon: <HandCoins />,
        label: "admin.rail.sponsorships",
      },
    ],
    label: "admin.rail.groups.community",
  },
  {
    id: "operations",
    items: [
      {
        href: "/admin/dead-letters",
        icon: <MailWarning />,
        label: "admin.rail.deadLetters",
      },
      { href: "/admin/audit", icon: <ScrollText />, label: "admin.rail.audit" },
      { href: "/admin/emails", icon: <Mail />, label: "admin.rail.emails" },
      {
        href: "/admin/settings",
        icon: <Settings />,
        label: "admin.rail.settings",
      },
    ],
    label: "admin.rail.groups.operations",
  },
];

/** A path without its trailing slash (the root stays `/`). */
export function trimSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

/** The rail item a path belongs to (the dashboard only on the exact path). */
export function activeHref(pathname: string): string | undefined {
  const path = trimSlash(pathname);
  if (path === "/admin") {
    return "/admin";
  }
  return [...RAIL_GROUPS.flatMap((group) => group.items)].find(
    (item) => path === item.href || path.startsWith(`${item.href}/`)
  )?.href;
}

function RailLink({
  active,
  item,
}: {
  active: boolean;
  item: RailItem;
}): ReactNode {
  const { t } = useTranslation();
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active}>
        <Link
          onClick={isMobile ? () => setOpenMobile(false) : undefined}
          // A hover preload runs the admin gate and the loader for a screen
          // that is usually not opened (and is aborted by a reload).
          preload={false}
          to={item.href}
        >
          <span aria-hidden="true">{item.icon}</span>
          <span>{t(item.label)}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function RailGroupSection({
  active,
  group,
}: {
  active: string | undefined;
  group: RailGroup;
}): ReactNode {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const holdsActive = group.items.some((item) => item.href === active);
  // Arriving on a section opens its group.
  useEffect(() => {
    if (holdsActive) {
      setOpen(true);
    }
  }, [holdsActive]);
  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <SidebarGroup>
        <CollapsibleTrigger
          className={cn(
            "flex min-h-touch w-full items-center justify-between rounded-xl px-3 font-medium text-caption text-sidebar-foreground-muted",
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          )}
        >
          {t(group.label)}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 transition-transform motion-reduce:transition-none",
              open ? "" : "-rotate-90"
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <RailLink
                  active={item.href === active}
                  item={item}
                  key={item.href}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

function RailNav(): ReactNode {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const active = activeHref(pathname);
  return (
    <nav aria-label={t("admin.rail.label")} className="flex min-h-0 flex-1">
      <SidebarContent className="gap-0 py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <RailLink active={active === "/admin"} item={DASHBOARD} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {RAIL_GROUPS.map((group) => (
          <RailGroupSection active={active} group={group} key={group.id} />
        ))}
      </SidebarContent>
    </nav>
  );
}

/**
 * The admin sidebar (shadcn sidebar block): a panel beside the screen from
 * `md` (sticky under the site header, hidden with the toolbar's trigger), a
 * sheet below it. The state lives in the layout's `SidebarProvider`.
 */
export function AdminRail(): ReactNode {
  const { t } = useTranslation();
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar();
  if (isMobile) {
    return (
      <Sheet onOpenChange={setOpenMobile} open={openMobile}>
        <SheetContent
          className="w-72 bg-sidebar p-0 text-sidebar-foreground"
          side="left"
          title={t("admin.rail.label")}
        >
          <RailNav />
        </SheetContent>
      </Sheet>
    );
  }
  if (!open) {
    return null;
  }
  return (
    <Sidebar
      // Hidden below `md` in the markup itself: the server renders this
      // branch (it cannot tell a phone), and a 16rem rail beside the page
      // until hydration is a layout shift and, at 320 px, no reflow.
      className="sticky top-16 hidden h-[calc(100svh-4rem)] shrink-0 self-start border-sidebar-border border-r md:flex"
      collapsible="none"
    >
      <RailNav />
    </Sidebar>
  );
}
