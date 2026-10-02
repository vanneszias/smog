import { useTranslation } from "@smog/i18n/react";
import { cn, ErrorState, Heading, Text } from "@smog/ui-web";
import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { type ReactNode, useCallback, useState } from "react";

/** The page column: the header's width and gutters (spec §16: 16/24/32). */
export function Page({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-content flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8 lg:px-8",
        className
      )}
    >
      {children}
    </div>
  );
}

/** A screen title (the page's h1) with an optional line under it. */
export function PageHeader({
  actions,
  description,
  title,
}: {
  actions?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}): ReactNode {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Heading level={1}>{title}</Heading>
        {description ? <Text tone="muted">{description}</Text> : null}
      </div>
      {actions}
    </div>
  );
}

/** A loader or render failure: the kit ErrorState, retrying the route. */
export function RouteError({ error, reset }: ErrorComponentProps): ReactNode {
  const router = useRouter();
  const { t } = useTranslation();
  const [retrying, setRetrying] = useState(false);
  console.error("[site] Failed to render the page:", error);
  const retry = useCallback((): void => {
    setRetrying(true);
    router
      .invalidate()
      .then(reset)
      .catch((cause: unknown) => {
        console.error("[site] Failed to reload the page:", cause);
      })
      .finally(() => setRetrying(false));
  }, [reset, router]);
  return (
    <Page>
      <ErrorState
        description={t("states.error.description")}
        level={2}
        onRetry={retry}
        retrying={retrying}
      />
    </Page>
  );
}
