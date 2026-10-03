import { formatDate } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { sponsorshipError } from "@smog/sponsorships/client";
import {
  Button,
  EmptyState,
  ErrorState,
  Heading,
  Skeleton,
} from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { usePageLocale } from "./page-locale";

function BackLink(): ReactNode {
  const { t } = useTranslation();
  return (
    <Button asChild variant="secondary">
      <Link to="/">{t("sponsor.link.back")}</Link>
    </Button>
  );
}

export interface LinkStateProps {
  error: unknown;
  isFetching: boolean;
  /** No answer yet. */
  pending: boolean;
  retry: () => void;
  /** `null`: the link has no (valid) token. */
  token: string | null;
}

/**
 * The guards of a re-edit or renewal link (S-19, S-20): no token
 * ("Invalid link"), checking, unknown or used ("Link not found"), expired
 * (with its date), or a failed read (retry). `null` once the link is good.
 */
export function LinkState({
  error,
  isFetching,
  pending,
  retry,
  token,
}: LinkStateProps): ReactNode {
  const { t } = useTranslation();
  const locale = usePageLocale();
  if (token === null) {
    return (
      <EmptyState
        action={<BackLink />}
        description={t("sponsor.link.invalid.description")}
        level={1}
        title={t("sponsor.link.invalid.title")}
      />
    );
  }
  const known = sponsorshipError(error);
  if (known?.code === "TOKEN_INVALID" || known?.code === "NOT_FOUND") {
    return (
      <EmptyState
        action={<BackLink />}
        description={t("sponsor.link.notFound.description")}
        level={1}
        title={t("sponsor.link.notFound.title")}
      />
    );
  }
  if (known?.code === "TOKEN_EXPIRED") {
    const expiresAt = (known.data as { expiresAt?: unknown } | undefined)
      ?.expiresAt;
    return (
      <EmptyState
        action={<BackLink />}
        description={
          <>
            {t("sponsor.link.expired.description")}
            {typeof expiresAt === "number" ? (
              <span className="mt-2 block">
                {t("sponsor.link.expired.since", {
                  date: formatDate(expiresAt, locale),
                })}
              </span>
            ) : null}
          </>
        }
        level={1}
        title={t("sponsor.link.expired.title")}
      />
    );
  }
  if (error) {
    return <ErrorState level={1} onRetry={retry} retrying={isFetching} />;
  }
  if (pending) {
    return (
      <div className="flex flex-col gap-4" role="status">
        {/* The page's h1 while the link is checked (review I-3). */}
        <Heading level={1}>{t("sponsor.link.loading")}</Heading>
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  return null;
}
