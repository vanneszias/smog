import { useTranslation } from "@smog/i18n/react";
import { useTranslationCoverage } from "@smog/translation/client";
import {
  coveragePercent,
  type LanguageCoverage,
} from "@smog/translation/schema";
import {
  Card,
  CardContent,
  CardTitle,
  ErrorState,
  ProgressBar,
  Skeleton,
  Text,
  TextLink,
} from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";

function CoverageRow({ row }: { row: LanguageCoverage }): ReactNode {
  const { t } = useTranslation();
  const percent = coveragePercent(row);
  return (
    <li className="flex flex-col gap-1" data-testid={`coverage-${row.code}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text as="span" weight="semibold">
          {row.name}
        </Text>
        <Text as="span" size="body-sm" tone="muted">
          {t("admin.translation.coverage.percent", { percent })}
        </Text>
      </div>
      <ProgressBar
        label={t("admin.translation.coverage.progress", { language: row.name })}
        tone={percent === 100 ? "success" : "primary"}
        value={percent}
      />
      {row.isDefault ? null : (
        <Text as="p" size="caption" tone="muted">
          {row.missing > 0 ? (
            <TextLink asChild>
              <Link
                search={{ lang: row.code, status: "missing" }}
                to="/admin/translation/strings"
              >
                {t("admin.translation.coverage.missing", {
                  n: row.missing,
                })}
              </Link>
            </TextLink>
          ) : (
            t("admin.translation.coverage.complete")
          )}
          {row.stale > 0 ? (
            <>
              {" · "}
              <TextLink asChild>
                <Link
                  search={{ lang: row.code, status: "stale" }}
                  to="/admin/translation/strings"
                >
                  {t("admin.translation.coverage.stale", { n: row.stale })}
                </Link>
              </TextLink>
            </>
          ) : null}
          {row.invalid > 0 ? (
            <>
              {" · "}
              <TextLink asChild>
                <Link
                  search={{ lang: row.code, status: "invalid" }}
                  to="/admin/translation/strings"
                >
                  {t("admin.translation.coverage.invalid", {
                    n: row.invalid,
                  })}
                </Link>
              </TextLink>
            </>
          ) : null}
        </Text>
      )}
    </li>
  );
}

/**
 * The translation coverage per enabled language (phase 10b task 4): how
 * much of the interface each language shows in its own words, with links to
 * the strings still missing, outdated or broken. On the admin dashboard and
 * above the strings table.
 */
export function CoverageCard({ className }: { className?: string }): ReactNode {
  const { t } = useTranslation();
  const coverage = useTranslationCoverage();
  const { refetch } = coverage;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the coverage:", error);
    });
  }, [refetch]);
  let body: ReactNode;
  if (coverage.data) {
    body = (
      <ul className="flex flex-col gap-4">
        {coverage.data.languages.map((row) => (
          <CoverageRow key={row.code} row={row} />
        ))}
      </ul>
    );
  } else if (coverage.isError) {
    body = <ErrorState level={3} onRetry={retry} />;
  } else {
    body = <Skeleton className="h-24 w-full" />;
  }
  return (
    <Card className={className} data-testid="coverage-card">
      <CardContent className="gap-3">
        <CardTitle className="font-medium text-body-sm" level={2}>
          {t("admin.translation.coverage.title")}
        </CardTitle>
        {body}
      </CardContent>
    </Card>
  );
}
