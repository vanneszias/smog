import { useTranslation } from "@smog/i18n/react";
import { cn, EmptyState, Heading, Text } from "@smog/ui-web";
import { Construction } from "lucide-react";
import type { ReactNode } from "react";

export interface AdminPageProps {
  /** Buttons next to the title (e.g. "New gesture"). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  title: ReactNode;
}

/**
 * An admin screen: the h1, an optional line and actions, then the content.
 * Fluid width (spec §16: the admin is not capped at the content width),
 * dense spacing, tokens only.
 */
export function AdminPage({
  actions,
  children,
  className,
  description,
  title,
}: AdminPageProps): ReactNode {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-1 flex-col gap-5 px-4 py-5 md:px-6 lg:px-8",
        className
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Heading level={1}>{title}</Heading>
          {description ? (
            <Text size="body-sm" tone="muted">
              {description}
            </Text>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** The placeholder of an admin screen that a later task of this phase builds. */
export function AdminComingSoon({ title }: { title: ReactNode }): ReactNode {
  const { t } = useTranslation();
  return (
    <AdminPage title={title}>
      <EmptyState
        description={t("admin.comingSoon.description")}
        icon={<Construction />}
        level={2}
        title={t("admin.comingSoon.title")}
      />
    </AdminPage>
  );
}
