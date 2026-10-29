import { useTranslation } from "@smog/i18n/react";
import { Button, cn, HandIllustration, Heading, Text } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useId } from "react";

export interface StatusPageProps {
  /** The actions, the recommended one first. */
  actions: ReactNode;
  description: ReactNode;
  /** The short label above the title ("Error 404"). */
  eyebrow: ReactNode;
  title: ReactNode;
  /** A failure is an alert (announced); a 404 is a plain page. */
  tone: "notFound" | "error";
}

/**
 * A whole page that is a status, not content: the 404 and a route that
 * failed. The maintenance page's look (a card, the three brand hands, a
 * badge) in the kit's tokens, with the page's one h1. Inline failures keep
 * the compact kit `ErrorState`.
 */
export function StatusPage({
  actions,
  description,
  eyebrow,
  title,
  tone,
}: StatusPageProps): ReactNode {
  const titleId = useId();
  const error = tone === "error";
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-6 md:py-16">
      <section
        aria-labelledby={titleId}
        className="flex w-full max-w-xl flex-col items-center rounded-2xl border border-border bg-card px-5 py-10 text-center text-card-foreground shadow-1 sm:px-10 sm:py-12"
        data-slot="status-page"
        data-tone={tone}
      >
        <div
          aria-hidden="true"
          className="mb-8 flex max-w-full items-end justify-center gap-3 text-primary sm:gap-7"
        >
          <HandIllustration className="h-8 opacity-60 sm:h-14" hand={0} />
          <HandIllustration
            className={cn("h-11 sm:h-20", error && "text-highlight")}
            hand={1}
          />
          <HandIllustration className="h-8 opacity-60 sm:h-14" hand={2} />
        </div>
        <div
          className="flex max-w-md flex-col items-center gap-3"
          role={error ? "alert" : undefined}
        >
          <Text
            as="span"
            className={cn(
              "rounded-full px-3 py-1",
              error
                ? "bg-danger-subtle text-danger-strong"
                : "bg-primary-subtle text-primary-strong"
            )}
            size="body-sm"
            weight="semibold"
          >
            {eyebrow}
          </Text>
          <Heading id={titleId} level={1}>
            {title}
          </Heading>
          <Text tone="muted">{description}</Text>
        </div>
        <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center">
          {actions}
        </div>
      </section>
    </div>
  );
}

/** The root `notFoundComponent`: a direct visit keeps its 404 status. */
export function NotFoundPage(): ReactNode {
  const { t } = useTranslation();
  return (
    <StatusPage
      actions={
        <>
          <Button asChild>
            <Link to="/">{t("states.notFound.action")}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/gestures">{t("states.notFound.browse")}</Link>
          </Button>
        </>
      }
      description={t("states.notFound.lead")}
      eyebrow={t("states.notFound.eyebrow")}
      title={t("states.notFound.title")}
      tone="notFound"
    />
  );
}
