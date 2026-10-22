import type { TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  useApplyImport,
  useExportStrings,
  useLanguages,
  usePreviewImport,
  validationCodeOf,
} from "@smog/translation/client";
import {
  IMPORT_MAX_CHARS,
  type ImportPlan,
  type StringFormat,
} from "@smog/translation/schema";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  Field,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Select,
  Skeleton,
  Text,
  useToast,
} from "@smog/ui-web";
import { Download, Upload } from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";

/**
 * Saves a file the browser holds (an object URL and a temporary link): the
 * export is an oRPC answer, so there is no URL to navigate to.
 */
function downloadFile(file: {
  content: string;
  contentType: string;
  filename: string;
}): void {
  const url = URL.createObjectURL(
    new Blob([file.content], { type: file.contentType })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.rel = "noopener";
  link.hidden = true;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // After the click has handed the file to the browser.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

const FORMATS = ["json", "csv"] as const satisfies readonly StringFormat[];

/** "Export": one language or all, as JSON or CSV. */
export function ExportMenu(): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const languages = useLanguages();
  const exportStrings = useExportStrings();
  const run = useCallback(
    async (format: StringFormat, locale: string | undefined) => {
      try {
        downloadFile(await exportStrings.mutateAsync({ format, locale }));
      } catch (error) {
        console.error("[admin] Failed to export the strings:", error);
        toast({
          title: t("admin.translation.export.failed"),
          variant: "danger",
        });
      }
    },
    [exportStrings, t, toast]
  );
  const enabled = (languages.data?.items ?? []).filter((item) => item.enabled);
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button icon={<Download />} variant="secondary">
          {t("admin.translation.export.button")}
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        {enabled.map((language) => (
          <ExportItems
            key={language.code}
            label={language.name}
            locale={language.code}
            onRun={run}
          />
        ))}
        <MenuSeparator />
        <MenuLabel>{t("admin.translation.export.all")}</MenuLabel>
        <ExportItems label={null} locale={undefined} onRun={run} />
      </MenuContent>
    </Menu>
  );
}

function ExportItem({
  format,
  label,
  locale,
  onRun,
}: {
  format: StringFormat;
  label: string | null;
  locale: string | undefined;
  onRun: (format: StringFormat, locale: string | undefined) => void;
}): ReactNode {
  const { t } = useTranslation();
  const run = useCallback(() => onRun(format, locale), [format, locale, onRun]);
  return (
    <MenuItem onSelect={run}>
      {label
        ? t("admin.translation.export.item", {
            format: format.toUpperCase(),
            language: label,
          })
        : t("admin.translation.export.allItem", {
            format: format.toUpperCase(),
          })}
    </MenuItem>
  );
}

function ExportItems({
  label,
  locale,
  onRun,
}: {
  label: string | null;
  locale: string | undefined;
  onRun: (format: StringFormat, locale: string | undefined) => void;
}): ReactNode {
  return (
    <>
      {FORMATS.map((format) => (
        <ExportItem
          format={format}
          key={format}
          label={label}
          locale={locale}
          onRun={onRun}
        />
      ))}
    </>
  );
}

const FROM_FILE = "file";

/** The message of each reason a file cannot be read (`ImportFileProblem` on the server). */
const FILE_PROBLEMS = {
  invalidCsv: "admin.translation.import.errors.file.invalidCsv",
  invalidJson: "admin.translation.import.errors.file.invalidJson",
  needsLanguage: "admin.translation.import.errors.file.needsLanguage",
  noKeyColumn: "admin.translation.import.errors.file.noKeyColumn",
  noLanguageColumn: "admin.translation.import.errors.file.noLanguageColumn",
  unknownLanguage: "admin.translation.import.errors.file.unknownLanguage",
  unsupportedShape: "admin.translation.import.errors.file.unsupportedShape",
} as const satisfies Record<string, TranslationKey>;

function fileProblemKey(code: string | null): TranslationKey {
  return code && code in FILE_PROBLEMS
    ? FILE_PROBLEMS[code as keyof typeof FILE_PROBLEMS]
    : "admin.translation.import.errors.file.generic";
}

function formatOf(name: string): StringFormat {
  return name.toLowerCase().endsWith(".csv") ? "csv" : "json";
}

interface FileState {
  content: string;
  format: StringFormat;
  name: string;
}

/** The dry-run diff of an import: the counts, what changes and what is refused. */
function PlanView({ plan }: { plan: ImportPlan }): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3" data-testid="import-plan">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Badge variant="success">
            {t("admin.translation.import.added", { n: plan.added })}
          </Badge>
        </li>
        <li>
          <Badge variant="primary">
            {t("admin.translation.import.changed", { n: plan.changed })}
          </Badge>
        </li>
        <li>
          <Badge variant="neutral">
            {t("admin.translation.import.unchanged", { n: plan.unchanged })}
          </Badge>
        </li>
        <li>
          <Badge variant={plan.problemCount > 0 ? "danger" : "neutral"}>
            {t("admin.translation.import.skipped", { n: plan.problemCount })}
          </Badge>
        </li>
      </ul>
      {plan.changes.length > 0 ? (
        <section className="flex flex-col gap-1">
          <Text as="p" size="body-sm" weight="semibold">
            {t("admin.translation.import.changes")}
          </Text>
          <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-md border border-border-subtle p-2">
            {plan.changes.map((change) => (
              <li
                className="flex flex-col gap-0.5 text-body-sm"
                key={`${change.locale}-${change.key}`}
              >
                <code className="break-all text-caption">
                  {change.locale}: {change.key}
                </code>
                {change.before === null ? null : (
                  <span className="break-words text-muted-foreground line-through">
                    {change.before}
                  </span>
                )}
                <span className="break-words">{change.after}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {plan.problems.length > 0 ? (
        <section className="flex flex-col gap-1">
          <Text as="p" size="body-sm" weight="semibold">
            {t("admin.translation.import.problems")}
          </Text>
          <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border-subtle p-2">
            {plan.problems.map((problem) => (
              <li
                className="text-body-sm"
                key={`${problem.locale}-${problem.key}-${problem.problem}`}
              >
                <code className="break-all text-caption">
                  {problem.locale}: {problem.key}
                </code>{" "}
                {t(`admin.translation.import.problem.${problem.problem}`)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * "Import": choose a JSON or CSV file (and, for a file of one language,
 * which), see what it would change and what it would refuse, then apply.
 * Nothing is written before Apply, and a refused row is skipped, not
 * applied.
 */
export function ImportDialog(): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<FileState | null>(null);
  const [locale, setLocale] = useState(FROM_FILE);
  const [fileError, setFileError] = useState<string | null>(null);
  const languages = useLanguages();
  const preview = usePreviewImport();
  const apply = useApplyImport();
  const { mutate: runPreview, reset: resetPreview } = preview;

  // A dry run whenever the file or the language changes.
  useEffect(() => {
    if (!file) {
      resetPreview();
      return;
    }
    runPreview({
      content: file.content,
      format: file.format,
      locale: locale === FROM_FILE ? undefined : locale,
    });
  }, [file, locale, resetPreview, runPreview]);

  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        setFile(null);
        setLocale(FROM_FILE);
        setFileError(null);
        resetPreview();
      }
    },
    [resetPreview]
  );
  const onFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    setFileError(null);
    if (!chosen) {
      setFile(null);
      return;
    }
    if (chosen.size > IMPORT_MAX_CHARS) {
      setFile(null);
      setFileError("admin.translation.import.errors.tooLarge");
      return;
    }
    setFile({
      content: await chosen.text(),
      format: formatOf(chosen.name),
      name: chosen.name,
    });
  }, []);
  const onApply = useCallback(() => {
    if (!file) {
      return;
    }
    apply.mutate(
      {
        content: file.content,
        format: file.format,
        locale: locale === FROM_FILE ? undefined : locale,
      },
      {
        onError: () =>
          toast({
            title: t("admin.translation.import.errors.applyFailed"),
            variant: "danger",
          }),
        onSuccess: (result) => {
          toast({
            title: t("admin.translation.import.done", { n: result.applied }),
            variant: "success",
          });
          onOpenChange(false);
        },
      }
    );
  }, [apply, file, locale, onOpenChange, t, toast]);

  const enabled = (languages.data?.items ?? []).filter((item) => item.enabled);
  const fileProblem = preview.isError
    ? validationCodeOf(preview.error, "content")
    : null;
  const plan = preview.data;
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button icon={<Upload />} variant="secondary">
          {t("admin.translation.import.button")}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-2xl"
        description={t("admin.translation.import.description")}
        title={t("admin.translation.import.title")}
      >
        <div className="flex flex-col gap-4">
          <Field
            error={
              fileError
                ? t("admin.translation.import.errors.tooLarge")
                : undefined
            }
            hint={t("admin.translation.import.fileHint")}
            label={t("admin.translation.import.file")}
          >
            <Input
              accept=".json,.csv,application/json,text/csv"
              onChange={onFile}
              type="file"
            />
          </Field>
          <Field label={t("admin.translation.import.language")}>
            <Select
              onValueChange={setLocale}
              options={[
                {
                  label: t("admin.translation.import.fromFile"),
                  value: FROM_FILE,
                },
                ...enabled.map((language) => ({
                  label: language.name,
                  value: language.code,
                })),
              ]}
              value={locale}
            />
          </Field>
          {file && preview.isPending ? (
            <Skeleton aria-busy="true" className="h-24 w-full" />
          ) : null}
          {preview.isError ? (
            <Alert variant="danger">
              <AlertTitle>
                {t("admin.translation.import.errors.title")}
              </AlertTitle>
              <AlertDescription>
                {t(fileProblemKey(fileProblem))}
              </AlertDescription>
            </Alert>
          ) : null}
          {plan ? <PlanView plan={plan} /> : null}
        </div>
        <DialogFooter>
          <Button
            disabled={!plan || plan.added + plan.changed === 0}
            loading={apply.isPending}
            onClick={onApply}
          >
            {t("admin.translation.import.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
