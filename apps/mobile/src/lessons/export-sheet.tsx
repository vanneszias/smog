import { useTranslation } from "@smog/i18n/react";
import { useLessonExportPreview } from "@smog/lessons/client";
import {
  LESSON_TEMPLATES,
  type LessonExportPreview,
  type LessonTemplate,
  lessonPdfPath,
} from "@smog/lessons/schema";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  SegmentedControl,
  Select,
  Sheet,
  SheetContent,
  SheetFooter,
  Skeleton,
  Text,
  useToast,
} from "@smog/ui-native";
import { type ReactElement, useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { useAuthClient } from "@/lib/auth-client";
import { useRuntimeCatalogue } from "@/lib/catalogue";
import {
  fetchLessonPdf,
  LessonPdfError,
  type LessonPdfErrorCode,
  lessonPdfFileName,
  shareLessonPdf,
} from "@/lib/lesson-file";
import { apiUrl } from "@/lib/site";

/** The catalogue key of what went wrong (the template-wide ones are the web dialog's). */
const ERROR_KEYS = {
  FAILED: "admin.lessons.export.errors.generic",
  FORBIDDEN: "teacherLessons.export.errors.forbidden",
  NOT_FOUND: "teacherLessons.export.errors.notFound",
  OFFLINE: "teacherLessons.export.errors.offline",
  RATE_LIMITED: "admin.lessons.export.errors.rateLimited",
  SHARING_UNAVAILABLE: "teacherLessons.export.errors.sharingUnavailable",
  TIMEOUT: "admin.lessons.export.errors.timeout",
  TOO_LARGE: "admin.lessons.export.errors.tooLarge",
  TOO_MANY: "admin.lessons.export.errors.tooMany",
  UNAUTHORIZED: "teacherLessons.export.errors.unauthorized",
} as const satisfies Record<LessonPdfErrorCode, string>;

function isTemplate(value: string): value is LessonTemplate {
  return (LESSON_TEMPLATES as readonly string[]).includes(value);
}

/** What the PDF will hold, from `lessons.exportPreview`: the count, the cap and every gap. */
function PreviewSummary({
  language,
  preview,
}: {
  language: string;
  preview: LessonExportPreview;
}): ReactElement {
  const { t } = useTranslation();
  if (preview.overLimit) {
    return (
      <Alert testID="export-over-limit" variant="destructive">
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
    <View className="gap-3" testID="export-preview">
      <Text>
        {t("admin.lessons.export.summary", { count: preview.gestures })}
      </Text>
      {preview.skipped.length > 0 ? (
        <Alert>
          <AlertTitle>
            {t("admin.lessons.export.skippedTitle", {
              count: preview.skipped.length,
            })}
          </AlertTitle>
          <AlertDescription>
            {preview.skipped.map((gesture) => gesture.name).join(", ")}
          </AlertDescription>
        </Alert>
      ) : null}
      {preview.issues.length > 0 ? (
        <Alert>
          <AlertTitle>{t("admin.lessons.export.issuesTitle")}</AlertTitle>
          {preview.issues.map((issue) => {
            const flags = (
              [
                [issue.fallback, "fallback"],
                [issue.missing, "missing"],
                [issue.noDrawing, "noDrawing"],
                [issue.unsupportedDrawing, "unsupportedDrawing"],
              ] as const
            )
              .filter(([on]) => on)
              .map(([, key]) => t(`admin.lessons.export.issue.${key}`));
            return (
              <AlertDescription key={issue.id}>
                {issue.name}: {flags.join(", ")}
              </AlertDescription>
            );
          })}
        </Alert>
      ) : (
        <Text size="body-sm" tone="muted">
          {t("admin.lessons.export.clean", { language })}
        </Text>
      )}
    </View>
  );
}

export interface ExportSheetProps {
  lessonId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** The saved version: a change refreshes the preview. */
  version: number;
}

/**
 * Export a lesson as a PDF: the sheet (teachers' or participants', the
 * language), what the PDF will hold (`lessons.exportPreview`: read only,
 * with the gaps and the cap), then Download and share, which calls the
 * authenticated route and opens the share sheet. The mobile app never edits
 * a lesson or its teacher info.
 */
export function ExportSheet({
  lessonId,
  onOpenChange,
  open,
  version,
}: ExportSheetProps): ReactElement {
  const { t } = useTranslation();
  const { toast } = useToast();
  const auth = useAuthClient();
  const { languages, wanted } = useRuntimeCatalogue();
  const [template, setTemplate] = useState<LessonTemplate>("teachers");
  const [chosen, setChosen] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<LessonPdfErrorCode | null>(null);
  const locale = chosen ?? wanted;
  const languageName =
    languages.find((language) => language.code === locale)?.name ?? locale;
  const preview = useLessonExportPreview(
    { id: lessonId, locale, template },
    version,
    open
  );

  const changeTemplate = useCallback((value: string) => {
    if (isTemplate(value)) {
      setTemplate(value);
      setError(null);
    }
  }, []);
  const changeLocale = useCallback((value: string) => {
    setChosen(value);
    setError(null);
  }, []);

  const download = useCallback(async () => {
    setWorking(true);
    setError(null);
    try {
      const bytes = await fetchLessonPdf({
        cookie: await auth.getCookie(),
        url: apiUrl(lessonPdfPath(lessonId, template, locale)),
      });
      await shareLessonPdf(
        bytes,
        lessonPdfFileName(lessonId, template, locale),
        t("teacherLessons.export.shareTitle")
      );
    } catch (failure) {
      setError(
        failure instanceof LessonPdfError ? failure.code : ("FAILED" as const)
      );
      if (!(failure instanceof LessonPdfError)) {
        console.error("[lessons] Failed to export the lesson:", failure);
        toast({ title: t("states.actionFailed"), variant: "danger" });
      }
    } finally {
      setWorking(false);
    }
  }, [auth, lessonId, locale, t, template, toast]);

  const blocked = preview.data?.overLimit === true;
  let previewBody: ReactElement;
  if (preview.isError) {
    previewBody = (
      <Alert variant="destructive">
        <AlertDescription>{t("admin.lessons.export.failed")}</AlertDescription>
      </Alert>
    );
  } else if (preview.data) {
    previewBody = (
      <PreviewSummary language={languageName} preview={preview.data} />
    );
  } else {
    previewBody = <Skeleton className="h-16" testID="export-loading" />;
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        description={t("teacherLessons.export.description")}
        title={t("teacherLessons.export.title")}
      >
        <ScrollView contentContainerClassName="gap-4" testID="export-sheet">
          <Field label={t("admin.lessons.export.templateLabel")}>
            <SegmentedControl
              onValueChange={changeTemplate}
              options={[
                {
                  label: t("admin.lessons.export.teachers"),
                  value: "teachers",
                },
                {
                  label: t("admin.lessons.export.participants"),
                  value: "participants",
                },
              ]}
              value={template}
            />
          </Field>
          <Text size="body-sm" tone="muted">
            {t(`admin.lessons.export.${template}Hint`)}
          </Text>
          <Field label={t("admin.lessons.export.languageLabel")}>
            <Select
              onValueChange={changeLocale}
              options={languages.map((language) => ({
                label: language.name,
                value: language.code,
              }))}
              value={locale}
            />
          </Field>
          {previewBody}
          {error ? (
            <Alert testID="export-error" variant="destructive">
              <AlertDescription>{t(ERROR_KEYS[error])}</AlertDescription>
            </Alert>
          ) : null}
        </ScrollView>
        <SheetFooter>
          <Button
            disabled={blocked || !preview.data}
            loading={working}
            onPress={download}
            testID="export-download"
          >
            {working
              ? t("teacherLessons.export.downloading")
              : t("teacherLessons.export.download")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
