import { LEGAL_KINDS, type LegalKind } from "@smog/i18n/legal/markup";
import { useTranslation } from "@smog/i18n/react";
import { useLanguages, useLegalOverview } from "@smog/translation/client";
import type { LegalOverviewItem } from "@smog/translation/schema";
import {
  Alert,
  AlertDescription,
  Badge,
  ErrorState,
  Field,
  SegmentedControl,
  Select,
  Skeleton,
  Text,
} from "@smog/ui-web";
import { type ReactNode, useCallback, useMemo } from "react";
import { LegalWorkspace } from "./legal-workspace";

export interface LegalSearch {
  kind: LegalKind;
  lang?: string;
}

/** `?kind=privacy|terms` (default privacy) and `?lang=<code>` (default: the first language). */
export function validateLegalAdminSearch(
  search: Record<string, unknown>
): LegalSearch {
  const kind = LEGAL_KINDS.find((item) => item === search.kind) ?? "privacy";
  const lang =
    typeof search.lang === "string" && search.lang.length <= 35
      ? search.lang
      : undefined;
  return lang ? { kind, lang } : { kind };
}

function StateBadges({ item }: { item: LegalOverviewItem | undefined }) {
  const { t } = useTranslation();
  if (!item) {
    return null;
  }
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="legal-state"
    >
      {item.published ? (
        <Badge variant="success">
          {t("admin.translation.legal.publishedBadge", {
            date: item.published.effectiveDate,
            version: item.published.version,
          })}
        </Badge>
      ) : (
        <Badge>{t("admin.translation.legal.notPublished")}</Badge>
      )}
      {item.draft ? (
        <Badge variant="warning">
          {t("admin.translation.legal.draftBadge")}
        </Badge>
      ) : null}
    </div>
  );
}

/**
 * `/admin/translation/legal` (phase 10b task 7): pick a text (privacy or
 * terms) and a language, then edit its draft, preview it, publish it (a
 * translator or an admin) and read or restore the history (restore: an
 * admin). The public pages read the published row.
 */
export function LegalScreen({
  onSearchChange,
  search,
}: {
  onSearchChange: (next: LegalSearch) => void;
  search: LegalSearch;
}): ReactNode {
  const { t } = useTranslation();
  const languages = useLanguages();
  const overview = useLegalOverview();
  const enabled = useMemo(
    () => (languages.data?.items ?? []).filter((item) => item.enabled),
    [languages.data]
  );
  const locale =
    enabled.find((item) => item.code === search.lang)?.code ?? enabled[0]?.code;
  const onKind = useCallback(
    (kind: string) => {
      const next = LEGAL_KINDS.find((item) => item === kind);
      if (next) {
        onSearchChange({ ...search, kind: next });
      }
    },
    [onSearchChange, search]
  );
  const onLanguage = useCallback(
    (lang: string) => onSearchChange({ ...search, lang }),
    [onSearchChange, search]
  );
  if (languages.isError || overview.isError) {
    return <ErrorState title={t("admin.translation.legal.errors.load")} />;
  }
  if (!(languages.data && overview.data && locale)) {
    return <Skeleton className="h-64 w-full" />;
  }
  const current = overview.data.items.find(
    (row) => row.kind === search.kind && row.locale === locale
  );
  return (
    <div className="flex flex-col gap-5">
      <Alert>
        <AlertDescription>
          {t("admin.translation.legal.responsibility")}
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap items-end gap-4">
        <Field label={t("admin.translation.legal.text")}>
          <SegmentedControl
            aria-label={t("admin.translation.legal.text")}
            onValueChange={onKind}
            options={LEGAL_KINDS.map((kind) => ({
              label: t(`admin.translation.legal.kind.${kind}`),
              value: kind,
            }))}
            value={search.kind}
          />
        </Field>
        <Field label={t("admin.translation.legal.language")}>
          <Select
            onValueChange={onLanguage}
            options={enabled.map((language) => ({
              label: language.name,
              value: language.code,
            }))}
            value={locale}
          />
        </Field>
        <StateBadges item={current} />
      </div>
      <Text size="body-sm" tone="muted">
        {t("admin.translation.legal.dutchPrevails")}
      </Text>
      <LegalWorkspace kind={search.kind} locale={locale} />
    </div>
  );
}
