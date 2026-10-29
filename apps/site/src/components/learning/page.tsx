import { useTranslation } from "@smog/i18n/react";
import { Button, cn, Heading, Text } from "@smog/ui-web";
import {
  type ErrorComponentProps,
  Link,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { RotateCw } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { StatusPage } from "@/components/status-page";

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

/**
 * Retries per page that failed again. The boundary mounts a new error
 * component for each failure (an invalidate sets the errored match back to
 * pending), so the count cannot live in its state. Only a click writes it,
 * so the server always renders the first failure.
 */
const failedRetries = new Map<string, number>();

/**
 * A loader or render failure: a full status page that retries the route.
 * After a retry that failed again it says so and puts the home page first.
 */
export function RouteError({ error, reset }: ErrorComponentProps): ReactNode {
  const router = useRouter();
  const href = useRouterState({ select: (state) => state.location.href });
  const { t } = useTranslation();
  const [stillFailing] = useState(() => (failedRetries.get(href) ?? 0) > 0);
  const [retrying, setRetrying] = useState(false);
  // In an effect: the render body runs again for every re-render and
  // boundary retry, which logged one failure four times.
  useEffect(() => {
    console.error("[site] Failed to render the page:", error);
  }, [error]);
  const retry = useCallback((): void => {
    setRetrying(true);
    // Counted before the reload: the next error component can mount while
    // it runs. A reload that leaves no match in error forgets the page.
    failedRetries.set(href, (failedRetries.get(href) ?? 0) + 1);
    router
      .invalidate()
      .then(() => {
        if (!router.state.matches.some((match) => match.status === "error")) {
          failedRetries.delete(href);
        }
        reset();
      })
      .catch((cause: unknown) => {
        console.error("[site] Failed to reload the page:", cause);
      })
      .finally(() => setRetrying(false));
  }, [href, reset, router]);
  const retryButton = (
    <Button
      className="w-full sm:w-auto"
      icon={<RotateCw />}
      key="retry"
      loading={retrying}
      onClick={retry}
      variant={stillFailing ? "secondary" : "primary"}
    >
      {t("states.retry")}
    </Button>
  );
  const homeButton = (
    <Button
      asChild
      className="w-full sm:w-auto"
      key="home"
      variant={stillFailing ? "primary" : "secondary"}
    >
      <Link to="/">{t("states.notFound.action")}</Link>
    </Button>
  );
  return (
    <StatusPage
      actions={
        stillFailing ? [homeButton, retryButton] : [retryButton, homeButton]
      }
      data-still-failing={stillFailing || undefined}
      description={t(
        stillFailing
          ? "states.pageError.stillFailingDescription"
          : "states.pageError.description"
      )}
      hand={2}
      role="alert"
      title={t(
        stillFailing
          ? "states.pageError.stillFailingTitle"
          : "states.pageError.title"
      )}
      tone="quiet"
    />
  );
}
