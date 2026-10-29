import { useTranslation } from "@smog/i18n/react";
import { Button, cn, Heading, Text } from "@smog/ui-web";
import {
  type ErrorComponentProps,
  Link,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { RotateCw } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
 * The page the visitor retried, until it loads or they leave it. The route's
 * boundary resets itself whenever a load ends (its reset key is the router's
 * load time), so one retry can mount several error components, before and
 * after the retry's promise settles; each reads this. Only a click sets it,
 * so the server never does.
 */
let retriedHref: string | null = null;

function rememberRetry(router: ReturnType<typeof useRouter>, href: string) {
  retriedHref = href;
  const unsubscribe = router.subscribe("onResolved", () => {
    const { location, matches } = router.state;
    const failing =
      location.href === href &&
      matches.some((match) => match.status === "error");
    if (!failing) {
      if (retriedHref === href) {
        retriedHref = null;
      }
      unsubscribe();
    }
  });
}

/**
 * A loader or render failure: a full status page that retries the route.
 * After a retry that failed again it says so and puts the home page first.
 */
export function RouteError({ error, reset }: ErrorComponentProps): ReactNode {
  const router = useRouter();
  const href = useRouterState({ select: (state) => state.location.href });
  const { t } = useTranslation();
  const [failedAgain, setFailedAgain] = useState(() => retriedHref === href);
  const [retrying, setRetrying] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // In an effect: the render body runs again for every re-render and
  // boundary retry, which logged one failure four times.
  useEffect(() => {
    console.error("[site] Failed to render the page:", error);
  }, [error]);
  const retry = useCallback((): void => {
    rememberRetry(router, href);
    setRetrying(true);
    router
      .invalidate()
      .then(() => {
        // Replaced by the boundary: the new component shows the outcome.
        if (!mounted.current) {
          return;
        }
        // Still here: a loader that failed again leaves its match in error.
        if (router.state.matches.some((match) => match.status === "error")) {
          setFailedAgain(true);
        } else {
          reset();
        }
      })
      .catch((cause: unknown) => {
        console.error("[site] Failed to reload the page:", cause);
      })
      .finally(() => {
        if (mounted.current) {
          setRetrying(false);
        }
      });
  }, [href, reset, router]);
  const retryButton = (
    <Button
      icon={<RotateCw />}
      key="retry"
      loading={retrying}
      onClick={retry}
      variant={failedAgain ? "secondary" : "primary"}
    >
      {retrying ? t("states.routeError.retrying") : t("states.retry")}
    </Button>
  );
  const homeButton = (
    <Button asChild key="home" variant={failedAgain ? "primary" : "secondary"}>
      <Link to="/">{t("states.notFound.action")}</Link>
    </Button>
  );
  return (
    <StatusPage
      actions={
        failedAgain ? [homeButton, retryButton] : [retryButton, homeButton]
      }
      description={
        failedAgain
          ? t("states.routeError.failedDescription")
          : t("states.routeError.description")
      }
      eyebrow={t("states.routeError.eyebrow")}
      title={
        failedAgain
          ? t("states.routeError.failedTitle")
          : t("states.routeError.title")
      }
      tone="error"
    />
  );
}
