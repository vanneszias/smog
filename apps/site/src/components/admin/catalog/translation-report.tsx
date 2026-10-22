import { useTranslationReports } from "@smog/admin/client";
import type { TranslationReport } from "@smog/admin/schema";
import { useTranslation } from "@smog/i18n/react";
import { Badge, Button, Skeleton, Text } from "@smog/ui-web";
import { type ReactNode, useCallback } from "react";
import { useLocale } from "@/lib/locale";

function LanguageReport({
  name,
  onShow,
  report,
}: {
  name: string;
  onShow: ((locale: string) => void) | undefined;
  report: TranslationReport;
}): ReactNode {
  const { t } = useTranslation();
  const { categories, gestures } = report;
  const show = useCallback(
    () => onShow?.(report.locale),
    [onShow, report.locale]
  );
  const done = gestures.needsTranslation === 0 && categories.missing === 0;
  return (
    <li
      className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-card px-3 py-2"
      lang={report.locale}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Text weight="medium">{name}</Text>
        <Badge variant={done ? "success" : "warning"}>
          {done
            ? t("admin.catalogTranslation.report.allDone")
            : t("admin.catalogTranslation.needs")}
        </Badge>
      </div>
      <Text size="body-sm">
        {t("admin.catalogTranslation.report.gestures", {
          needs: gestures.needsTranslation,
          total: gestures.total,
        })}
      </Text>
      <Text size="caption" tone="muted">
        {t("admin.catalogTranslation.report.detail", {
          description: gestures.missingDescription,
          keywords: gestures.missingKeywords,
          name: gestures.missingName,
        })}
      </Text>
      <Text size="caption" tone="muted">
        {t("admin.catalogTranslation.report.categories", {
          missing: categories.missing,
          total: categories.total,
        })}
      </Text>
      {onShow && gestures.needsTranslation > 0 ? (
        <div>
          <Button onClick={show} size="sm" variant="secondary">
            {t("admin.catalogTranslation.report.show")}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/**
 * The "needs translation" counts per enabled language (the report of
 * `@smog/db`, shared with the list filter): how many gestures and
 * categories still show the default text, and what they miss. `onShow`
 * applies the list filter for a language. Nothing while no other language
 * is enabled.
 */
export function TranslationReportCard({
  onShow,
}: {
  onShow?: (locale: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  const { languages } = useLocale();
  const reports = useTranslationReports();
  if (reports.isPending) {
    return <Skeleton className="h-24 w-full sm:max-w-reading" />;
  }
  if (!reports.data || reports.data.length === 0) {
    return null;
  }
  return (
    <section
      aria-label={t("admin.catalogTranslation.report.title")}
      className="flex flex-col gap-2"
    >
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {reports.data.map((report) => (
          <LanguageReport
            key={report.locale}
            name={
              languages.find((language) => language.code === report.locale)
                ?.name ?? report.locale
            }
            onShow={onShow}
            report={report}
          />
        ))}
      </ul>
    </section>
  );
}
