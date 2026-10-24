import { useTranslation } from "@smog/i18n/react";
import { useLessonExportPreview } from "@smog/lessons/client";
import {
  LESSON_TEMPLATES,
  type LessonExportIssue,
  type LessonExportPreview,
  type LessonTemplate,
} from "@smog/lessons/schema";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  RadioGroup,
  Select,
  Skeleton,
  Text,
  useToast,
} from "@smog/ui-web";
import { FileDown } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useLocale } from "@/lib/locale";
import {
  downloadLessonPdf,
  type PdfDownloadProblem,
} from "./lesson-pdf-download";

const PROBLEM_KEYS = {
  generic: "admin.lessons.export.errors.generic",
  rateLimited: "admin.lessons.export.errors.rateLimited",
  timeout: "admin.lessons.export.errors.timeout",
  tooLarge: "admin.lessons.export.errors.tooLarge",
  tooMany: "admin.lessons.export.errors.tooMany",
} as const satisfies Record<PdfDownloadProblem, string>;

const ISSUE_BADGES = [
  ["fallback", "admin.lessons.export.issue.fallback", "neutral"],
  ["missing", "admin.lessons.export.issue.missing", "warning"],
  ["noDrawing", "admin.lessons.export.issue.noDrawing", "neutral"],
  [
    "unsupportedDrawing",
    "admin.lessons.export.issue.unsupportedDrawing",
    "warning",
  ],
] as const satisfies readonly [
  keyof LessonExportIssue,
  string,
  "neutral" | "warning",
][];

function IssueRow({ issue }: { issue: LessonExportIssue }): ReactNode {
  const { t } = useTranslation();
  return (
    <li className="flex flex-col gap-1 border-border-subtle border-b py-2 last:border-b-0">
      <Text size="body-sm" weight="medium">
        {issue.name}
      </Text>
      <span className="flex flex-wrap gap-1.5">
        {ISSUE_BADGES.filter(([field]) => issue[field]).map(
          ([field, key, variant]) => (
            <Badge key={field} variant={variant}>
              {t(key)}
            </Badge>
          )
        )}
      </span>
    </li>
  );
}

function Preview({
  language,
  preview,
}: {
  language: string;
  preview: LessonExportPreview;
}): ReactNode {
  const { t } = useTranslation();
  if (preview.overLimit) {
    return (
      <Alert variant="danger">
        <AlertDescription>
          {t("admin.lessons.export.overLimit", {
            count: preview.gestures,
            limit: preview.limit,
          })}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-3" data-testid="export-preview">
      <Text size="body-sm">
        {t("admin.lessons.export.summary", { count: preview.gestures })}
      </Text>
      {preview.issues.length === 0 && preview.skipped.length === 0 ? (
        <Alert variant="success">
          <AlertDescription>
            {t("admin.lessons.export.clean", { language })}
          </AlertDescription>
        </Alert>
      ) : null}
      {preview.skipped.length > 0 ? (
        <Alert variant="warning">
          <AlertTitle>
            {t("admin.lessons.export.skippedTitle", {
              count: preview.skipped.length,
            })}
          </AlertTitle>
          <AlertDescription>
            {preview.skipped.map((item) => item.name).join(", ")}
          </AlertDescription>
        </Alert>
      ) : null}
      {preview.issues.length > 0 ? (
        <section aria-label={t("admin.lessons.export.issuesTitle")}>
          <Text size="body-sm" tone="muted">
            {t("admin.lessons.export.issuesTitle")}
          </Text>
          <ul className="mt-1 max-h-56 overflow-y-auto pr-1">
            {preview.issues.map((issue) => (
              <IssueRow issue={issue} key={issue.id} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function PreviewState({
  language,
  query,
}: {
  language: string;
  query: ReturnType<typeof useLessonExportPreview>;
}): ReactNode {
  const { t } = useTranslation();
  if (query.isError) {
    return (
      <Alert variant="danger">
        <AlertDescription>{t("admin.lessons.export.failed")}</AlertDescription>
      </Alert>
    );
  }
  if (!query.data) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <Text size="body-sm" tone="muted">
          {t("admin.lessons.export.loading")}
        </Text>
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  return <Preview language={language} preview={query.data} />;
}

/**
 * The export dialog (spec 5.3), mounted by `LessonExportButton` only while it
 * is open (its own lazy chunk): the template (for teachers or for
 * participants), the language, a preview of what the PDF would contain (the
 * gestures that print default-language text or have a gap, the unpublished
 * ones left out, the drawings it cannot hold, "split the lesson" over the
 * cap) and the download. Any teacher or admin can export, whoever authored
 * the lesson. The download is a `fetch` of
 * `GET /api/teacher/lessons/<id>/pdf`, so a refusal shows here instead of a
 * JSON page.
 */
export function LessonExportDialog({
  lessonId,
  onClose,
  pending,
  version,
}: {
  lessonId: string;
  onClose: () => void;
  /** The builder still holds changes the server has not stored: the PDF would miss them, so the download waits. */
  pending: boolean;
  /** The saved version of the lesson: a save refreshes the preview. */
  version: number;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { languages, locale } = useLocale();
  const [template, setTemplate] = useState<LessonTemplate>("teachers");
  const [chosen, setChosen] = useState(locale);
  const [problem, setProblem] = useState<PdfDownloadProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useLessonExportPreview(
    { id: lessonId, locale: chosen, template },
    version,
    true
  );
  const languageOptions = useMemo(
    () =>
      languages.map((language) => ({
        label: language.name,
        value: language.code,
      })),
    [languages]
  );
  const templateOptions = useMemo(
    () =>
      LESSON_TEMPLATES.map((value) => ({
        description: t(`admin.lessons.export.${value}Hint`),
        label: t(`admin.lessons.export.${value}`),
        value,
      })),
    [t]
  );
  const languageName =
    languages.find((language) => language.code === chosen)?.name ?? chosen;
  const onOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        onClose();
      }
    },
    [onClose]
  );
  const onTemplate = useCallback((value: string) => {
    setProblem(null);
    setTemplate(value === "participants" ? "participants" : "teachers");
  }, []);
  const onLanguage = useCallback((value: string) => {
    setProblem(null);
    setChosen(value);
  }, []);
  const download = useCallback(() => {
    setProblem(null);
    setBusy(true);
    downloadLessonPdf(lessonId, template, chosen)
      .then((result) => {
        if (result.ok) {
          toast({ title: t("admin.lessons.export.done"), variant: "success" });
          onClose();
        } else {
          setProblem(result.problem);
        }
      })
      .catch((error: unknown) => {
        console.error("[lessons] Failed to download the PDF:", error);
        setProblem("generic");
      })
      .finally(() => setBusy(false));
  }, [chosen, lessonId, onClose, t, template, toast]);
  const blocked =
    busy ||
    pending ||
    !preview.data ||
    preview.data.overLimit ||
    preview.isError;
  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent
        description={t("admin.lessons.export.description")}
        title={t("admin.lessons.export.title")}
      >
        <div className="flex flex-col gap-4">
          <Field label={t("admin.lessons.export.templateLabel")}>
            <RadioGroup
              onValueChange={onTemplate}
              options={templateOptions}
              value={template}
            />
          </Field>
          <Field label={t("admin.lessons.export.languageLabel")}>
            <Select
              onValueChange={onLanguage}
              options={languageOptions}
              value={chosen}
            />
          </Field>
          <PreviewState language={languageName} query={preview} />
          {pending ? (
            <Text size="body-sm" tone="muted">
              {t("admin.lessons.status.dirty")}
            </Text>
          ) : null}
          {problem ? (
            <Alert variant="danger">
              <AlertDescription>{t(PROBLEM_KEYS[problem])}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              disabled={blocked}
              icon={<FileDown />}
              loading={busy}
              onClick={download}
            >
              {busy
                ? t("admin.lessons.export.downloading")
                : t("admin.lessons.export.download")}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
