import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  cn,
  HandIllustration,
  type HandIndex,
  Heading,
  Text,
} from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { type ComponentProps, type ReactNode, useId } from "react";

export interface StatusPageProps
  extends Omit<ComponentProps<"section">, "title"> {
  /** The ways on, most useful first (each a kit `Button`). */
  actions: ReactNode;
  /** A status code drawn large on the art panel (decorative). */
  code?: string;
  description: ReactNode;
  /** Which brand hand the art panel shows. */
  hand?: HandIndex;
  title: ReactNode;
  /** `brand`: the filled green; `quiet`: the soft tint, for a failure. */
  tone?: "brand" | "quiet";
}

/**
 * A page-level state (the 404, a route that failed to load): the page's h1,
 * what happened, the ways on and a brand art panel. Inline failures keep the
 * kit's compact `ErrorState`; this is only for a whole page.
 */
export function StatusPage({
  actions,
  className,
  code,
  description,
  hand = 1,
  title,
  tone = "brand",
  ...props
}: StatusPageProps): ReactNode {
  const titleId = useId();
  return (
    <div className="mx-auto flex w-full max-w-content flex-1 items-center px-4 py-8 md:px-6 md:py-16 lg:px-8">
      <section
        aria-labelledby={titleId}
        className={cn(
          "grid w-full items-center gap-8 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-12",
          className
        )}
        data-slot="status-page"
        {...props}
      >
        <div className="flex min-w-0 flex-col items-start gap-4">
          <Heading className="md:text-display" id={titleId} level={1}>
            {title}
          </Heading>
          <Text className="max-w-reading" tone="muted">
            {description}
          </Text>
          <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
            {actions}
          </div>
        </div>
        <div
          aria-hidden="true"
          className={cn(
            "relative order-first flex h-40 w-full items-center justify-center overflow-hidden rounded-4xl md:order-last md:h-auto md:aspect-square",
            tone === "brand"
              ? "bg-primary text-primary-foreground"
              : "bg-accent text-primary-strong"
          )}
          data-slot="status-art"
        >
          {/* Sized by width: the hands are wide drawings. Under the code. */}
          <HandIllustration
            className={cn(
              "h-auto text-current *:h-auto *:w-full",
              code
                ? "absolute -right-6 -bottom-6 w-1/2 opacity-30 md:w-3/5"
                : "w-1/2 opacity-80 md:w-3/4"
            )}
            hand={hand}
          />
          {code ? (
            <span className="relative font-bold text-7xl tabular-nums leading-none tracking-tight md:text-9xl">
              {code}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}

/** The root `notFoundComponent`: the 404 with home and the gestures. */
export function NotFoundPage(): ReactNode {
  const { t } = useTranslation();
  return (
    <StatusPage
      actions={
        <>
          <Button asChild className="w-full sm:w-auto">
            <Link to="/">{t("states.notFound.action")}</Link>
          </Button>
          <Button asChild className="w-full sm:w-auto" variant="secondary">
            <Link to="/gestures">{t("states.notFound.browse")}</Link>
          </Button>
        </>
      }
      code="404"
      description={t("states.notFound.description")}
      hand={1}
      title={t("states.notFound.title")}
    />
  );
}
