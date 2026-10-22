import type { TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  SidebarTrigger,
} from "@smog/ui-web";
import { Link, useLocation } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import { activeHref, RAIL_GROUPS } from "./admin-rail";

interface Crumb {
  href?: string;
  label: TranslationKey;
}

/** The trail for a path: Admin, the section and, below it, `new` or a detail. */
export function crumbsFor(pathname: string): Crumb[] {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const section = activeHref(path);
  if (!section || section === "/admin") {
    return [{ label: "admin.rail.label" }];
  }
  const item = RAIL_GROUPS.flatMap((group) => group.items).find(
    (candidate) => candidate.href === section
  );
  const crumbs: Crumb[] = [{ href: "/admin", label: "admin.rail.label" }];
  if (!item) {
    return crumbs;
  }
  const rest = path.slice(section.length);
  if (rest === "") {
    return [...crumbs, { label: item.label }];
  }
  return [
    ...crumbs,
    { href: item.href, label: item.label },
    { label: rest === "/new" ? "admin.gestures.new" : "admin.crumb.detail" },
  ];
}

/**
 * The bar above every admin screen: the sidebar's trigger (opens the sheet on
 * a phone, hides the panel from `md`) and the breadcrumbs.
 */
export function AdminToolbar(): ReactNode {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const crumbs = crumbsFor(pathname);
  return (
    <div className="flex items-center gap-2 border-border-subtle border-b px-4 py-1 md:px-6 lg:px-8">
      <SidebarTrigger label={t("admin.rail.open")} />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, index) => (
            <Fragment key={crumb.label}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem>
                {crumb.href ? (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.href}>{t(crumb.label)}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{t(crumb.label)}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
