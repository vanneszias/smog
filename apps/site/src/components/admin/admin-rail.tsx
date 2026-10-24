import type { AuthUser } from "@smog/auth/react";
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
import { Link, useLocation, useRouteContext } from "@tanstack/react-router";
import {
  ChevronDown,
  FolderTree,
  Hand,
  HandCoins,
  Languages,
  LayoutDashboard,
  Mail,
  MailWarning,
  Scale,
  ScrollText,
  Settings,
  TextCursorInput,
  Users,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

interface RailItem {
  /** Shown to admins only (a translator sees the other items of their group). */
  adminOnly?: true;
  href: string;
  icon: ReactNode;
  label: TranslationKey;
}

interface RailGroup {
  /** Shown to admins only; a translator sees the translation group only. */
  adminOnly?: true;
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
 * The admin sections (spec 1 §16, phase 10a): Content, Translation
 * (phase 10b: the strings for a translator or an admin, the language list
 * for an admin), Community and Operations. A translator sees the
 * translation group only (`railFor`). The teacher area (spec 3) is added
 * here later, shown by role.
 */
export const RAIL_GROUPS: readonly RailGroup[] = [
  {
    adminOnly: true,
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
    id: "translation",
    items: [
      {
        href: "/admin/translation/strings",
        icon: <TextCursorInput />,
        label: "admin.rail.strings",
      },
      {
        href: "/admin/translation/legal",
        icon: <Scale />,
        label: "admin.rail.legal",
      },
      {
        adminOnly: true,
        href: "/admin/translation/languages",
        icon: <Languages />,
        label: "admin.rail.languages",
      },
    ],
    label: "admin.rail.groups.translation",
  },
  {
    adminOnly: true,
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
    adminOnly: true,
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

/**
 * The groups a person sees: an admin every group, a translator the
 * translation group without the admin-only items (the language list).
 */
export function railFor(isAdmin: boolean): readonly RailGroup[] {
  if (isAdmin) {
    return RAIL_GROUPS;
  }
  return RAIL_GROUPS.filter((group) => !group.adminOnly).map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly),
  }));
}

/**
 * Whether the rail is for an admin: the `/admin` layout put the signed-in
 * user in the route context (so the server render knows it); without one
 * (a test, a screen outside the layout) the full rail shows.
 */
function useAdminUser(): AuthUser | undefined {
  return useRouteContext({
    select: (context) => (context as { admin?: AuthUser }).admin,
    strict: false,
  });
}

function useIsAdmin(): boolean {
  const admin = useAdminUser();
  return !admin || admin.roles.includes("admin");
}

/**
 * Whether the person has a rail at all: an admin and a translator do; a
 * teacher without either (phase 10c: the teacher-info screen is theirs
 * alone for now) has no section to navigate to.
 */
export function useHasRail(): boolean {
  const admin = useAdminUser();
  return (
    !admin ||
    admin.roles.includes("admin") ||
    admin.roles.includes("translator")
  );
}

function RailNav(): ReactNode {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isAdmin = useIsAdmin();
  const active = activeHref(pathname);
  return (
    <nav aria-label={t("admin.rail.label")} className="flex min-h-0 flex-1">
      <SidebarContent className="gap-0 py-2">
        {isAdmin ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <RailLink active={active === "/admin"} item={DASHBOARD} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
        {railFor(isAdmin).map((group) => (
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
  const hasRail = useHasRail();
  if (!hasRail) {
    return null;
  }
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
