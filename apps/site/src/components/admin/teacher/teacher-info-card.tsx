import { useAuthState } from "@smog/auth/react";
import { TEACHER_FIELD_MAX } from "@smog/db/enums";
import type { LanguageInfo, TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  teacherConflictOf,
  useSaveTeacherInfo,
  useTeacherInfo,
} from "@smog/lessons/client";
import {
  EMPTY_TEACHER_INFO,
  TEACHER_INFO_FIELDS,
  type TeacherInfoDetail,
  type TeacherInfoField,
  type TeacherInfoFields,
  type TeacherInfoRow,
} from "@smog/lessons/schema";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardTitle,
  cn,
  ErrorState,
  Field,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  Textarea,
  useToast,
} from "@smog/ui-web";
import { Save } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useLocale } from "@/lib/locale";

/** The label of each field (HC, PL, OR, BW, the C note, the free note, the summary). */
const LABELS = {
  bw: "admin.teacherInfo.fields.bw",
  cNote: "admin.teacherInfo.fields.cNote",
  hc: "admin.teacherInfo.fields.hc",
  note: "admin.teacherInfo.fields.note",
  or: "admin.teacherInfo.fields.or",
  pl: "admin.teacherInfo.fields.pl",
  summary: "admin.teacherInfo.fields.summary",
} as const satisfies Record<TeacherInfoField, TranslationKey>;

function draftOf(row: TeacherInfoRow | undefined): TeacherInfoFields {
  return row
    ? {
        bw: row.bw,
        cNote: row.cNote,
        hc: row.hc,
        note: row.note,
        or: row.or,
        pl: row.pl,
        summary: row.summary,
      }
    : EMPTY_TEACHER_INFO;
}

function sameDraft(a: TeacherInfoFields, b: TeacherInfoFields): boolean {
  return TEACHER_INFO_FIELDS.every((field) => a[field] === b[field]);
}

function hasText(fields: TeacherInfoFields): boolean {
  return TEACHER_INFO_FIELDS.some((field) => fields[field].trim() !== "");
}

/** The default language's text, the reference beside a translation. */
function Reference({
  fields,
  language,
}: {
  fields: TeacherInfoFields;
  language: LanguageInfo;
}): ReactNode {
  const { t } = useTranslation();
  const filled = TEACHER_INFO_FIELDS.filter(
    (field) => fields[field].trim() !== ""
  );
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md bg-surface-sunken p-4">
      <Text size="body-sm" tone="muted" weight="medium">
        {t("admin.teacherInfo.sourceLabel", { language: language.name })}
      </Text>
      {filled.length === 0 ? (
        <Text size="body-sm" tone="muted">
          {t("admin.teacherInfo.sourceEmpty", { language: language.name })}
        </Text>
      ) : (
        <dl className="flex flex-col gap-2">
          {filled.map((field) => (
            <div className="flex flex-col" key={field}>
              <dt className="font-medium text-body-sm text-muted-foreground">
                {t(LABELS[field])}
              </dt>
              <dd
                className="whitespace-pre-wrap break-words text-body-sm"
                lang={language.code}
              >
                {fields[field]}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function Keywords({
  keywords,
  language,
}: {
  keywords: readonly string[];
  language: LanguageInfo;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <Text size="body-sm" weight="medium">
        {t("admin.teacherInfo.keywords")}
      </Text>
      {keywords.length === 0 ? (
        <Text size="body-sm" tone="muted">
          {t("admin.teacherInfo.keywordsNone")}
        </Text>
      ) : (
        <ul className="flex flex-wrap gap-2" lang={language.code}>
          {keywords.map((keyword) => (
            <li key={keyword}>
              <Badge variant="neutral">{keyword}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One language's editor: the default text beside the fields, one save with a version lock. */
function LanguageForm({
  defaultLanguage,
  detail,
  language,
  readOnly,
}: {
  defaultLanguage: LanguageInfo;
  detail: TeacherInfoDetail;
  language: LanguageInfo;
  readOnly: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const save = useSaveTeacherInfo();
  const saved = detail.rows[language.code];
  const savedVersion = saved?.version ?? null;
  const [draft, setDraft] = useState<TeacherInfoFields>(() => draftOf(saved));
  // The text the draft started from, and the version a save is checked
  // against. Another teacher's save arrives as a new `saved`: an untouched
  // form takes it, an edited one keeps the draft and offers their text; the
  // form is never remounted.
  const [base, setBase] = useState<TeacherInfoFields>(() => draftOf(saved));
  const [expected, setExpected] = useState<number | null>(savedVersion);
  const [conflict, setConflict] = useState<{
    theirs: TeacherInfoFields;
    version: number | null;
  } | null>(null);
  const dirty = !sameDraft(draft, base);
  useEffect(() => {
    if (savedVersion === expected || savedVersion === conflict?.version) {
      return;
    }
    const theirs = draftOf(saved);
    if (sameDraft(draft, theirs) || sameDraft(draft, base)) {
      setDraft(theirs);
      setBase(theirs);
      setExpected(savedVersion);
      setConflict(null);
    } else {
      setConflict({ theirs, version: savedVersion });
    }
  }, [base, conflict?.version, draft, expected, saved, savedVersion]);
  const takeTheirs = useCallback(() => {
    if (conflict) {
      setDraft(conflict.theirs);
      setBase(conflict.theirs);
      setExpected(conflict.version);
      setConflict(null);
    }
  }, [conflict]);
  const keepMine = useCallback(() => {
    if (conflict) {
      setBase(conflict.theirs);
      setExpected(conflict.version);
      setConflict(null);
    }
  }, [conflict]);
  const onField = useCallback(
    (field: TeacherInfoField) => (event: ChangeEvent<HTMLTextAreaElement>) => {
      const { value } = event.target;
      setDraft((previous) => ({ ...previous, [field]: value }));
    },
    []
  );
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const sent = draft;
      save
        .mutateAsync({
          expectedVersion: expected,
          fields: sent,
          gestureId: detail.gesture.id,
          locale: language.code,
        })
        .then((result) => {
          setBase(sent);
          setExpected(result.version);
          toast({ title: t("admin.teacherInfo.saved"), variant: "success" });
        })
        .catch((error: unknown) => {
          const lost = teacherConflictOf(error);
          if (lost) {
            setConflict({
              theirs: draftOf(lost.current ?? undefined),
              version: lost.current?.version ?? null,
            });
          } else {
            console.error("[lessons] Failed to save the teacher info:", error);
          }
          toast({
            title: lost
              ? t("admin.teacherInfo.stale")
              : t("admin.teacherInfo.saveFailed"),
            variant: "danger",
          });
        });
    },
    [detail.gesture.id, draft, expected, language.code, save, t, toast]
  );
  const defaultFields = draftOf(detail.rows[defaultLanguage.code]);
  const isDefault = language.code === defaultLanguage.code;
  return (
    <form
      className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2"
      noValidate
      onSubmit={submit}
    >
      {isDefault ? null : (
        <Reference fields={defaultFields} language={defaultLanguage} />
      )}
      <div
        className={cn(
          "flex min-w-0 flex-col gap-4",
          isDefault && "lg:col-span-2"
        )}
      >
        {readOnly ? (
          <Alert>
            <AlertDescription>
              {t("admin.teacherInfo.readOnly", { language: language.name })}
            </AlertDescription>
          </Alert>
        ) : null}
        {conflict ? (
          <Alert variant="warning">
            <AlertTitle>
              {t("admin.translation.editor.conflictTitle")}
            </AlertTitle>
            <AlertDescription>
              <span className="block">
                {t("admin.translation.editor.conflictBody")}
              </span>
              <span
                className="mt-1 block whitespace-pre-wrap break-words font-medium"
                lang={language.code}
              >
                {TEACHER_INFO_FIELDS.map((field) => conflict.theirs[field])
                  .filter((part) => part !== "")
                  .join(" / ")}
              </span>
              <span className="mt-2 flex flex-wrap gap-2">
                <Button onClick={takeTheirs} size="sm" variant="secondary">
                  {t("admin.translation.editor.useTheirs")}
                </Button>
                <Button onClick={keepMine} size="sm" variant="secondary">
                  {t("admin.translation.editor.keepMine")}
                </Button>
              </span>
            </AlertDescription>
          </Alert>
        ) : null}
        {TEACHER_INFO_FIELDS.map((field) => (
          <div className="flex flex-col gap-3" key={field}>
            {field === "cNote" ? (
              <Keywords
                keywords={detail.keywords[language.code] ?? []}
                language={language}
              />
            ) : null}
            <Field
              counter={{ count: draft[field].length, max: TEACHER_FIELD_MAX }}
              hint={
                (field === "cNote" && t("admin.teacherInfo.cHint")) ||
                (field === "summary" && t("admin.teacherInfo.summaryHint")) ||
                undefined
              }
              label={t(LABELS[field])}
              optional
            >
              <Textarea
                lang={language.code}
                onChange={onField(field)}
                readOnly={readOnly}
                rows={field === "hc" || field === "summary" ? 2 : 3}
                value={draft[field]}
              />
            </Field>
          </div>
        ))}
        {readOnly ? null : (
          <div>
            <Button
              disabled={!dirty || conflict !== null}
              icon={<Save />}
              loading={save.isPending}
              type="submit"
            >
              {t("admin.teacherInfo.save")}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}

function InfoTabs({
  canAuthor,
  detail,
  languages,
}: {
  canAuthor: boolean;
  detail: TeacherInfoDetail;
  languages: readonly LanguageInfo[];
}): ReactNode {
  const { t } = useTranslation();
  const defaultLanguage = languages.find((language) => language.isDefault);
  // A translator starts on a language they can write.
  const first =
    canAuthor || !defaultLanguage
      ? languages[0]
      : languages.find((language) => !language.isDefault);
  const [active, setActive] = useState(first?.code ?? "");
  if (!(first && defaultLanguage)) {
    return null;
  }
  return (
    <Tabs onValueChange={setActive} value={active}>
      <TabsList aria-label={t("admin.teacherInfo.tabsLabel")}>
        {languages.map((language) => (
          <TabsTrigger
            key={language.code}
            lang={language.code}
            value={language.code}
          >
            {language.name}
            <Badge
              variant={
                hasText(draftOf(detail.rows[language.code]))
                  ? "success"
                  : "neutral"
              }
            >
              {hasText(draftOf(detail.rows[language.code]))
                ? t("admin.teacherInfo.filled")
                : t("admin.teacherInfo.empty")}
            </Badge>
          </TabsTrigger>
        ))}
      </TabsList>
      {languages.map((language) => (
        // Every tab stays mounted (hidden when inactive), so an unsaved
        // draft survives a switch to another language and back.
        <TabsContent
          forceMount
          hidden={active !== language.code}
          key={language.code}
          value={language.code}
        >
          <LanguageForm
            defaultLanguage={defaultLanguage}
            detail={detail}
            language={language}
            readOnly={!canAuthor && language.code === defaultLanguage.code}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

/**
 * A gesture's private teaching text in the admin editor and on the teacher
 * page: one tab per enabled language (the default first), the default
 * language's text beside each translation, the public C keywords above the
 * private C note. Each tab saves on its own through `teacher.saveInfo` with
 * a version lock; `canAuthor` is a teacher or an admin (a translator reads
 * the default language and writes the others; the procedure checks it again).
 */
export function TeacherInfoCard({
  canAuthor,
  gestureId,
}: {
  canAuthor: boolean;
  gestureId: string;
}): ReactNode {
  const { t } = useTranslation();
  const { languages: enabled } = useLocale();
  // The default language first: it is the reference of every other tab.
  const languages = [...enabled].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault)
  );
  const query = useTeacherInfo(gestureId);
  const { refetch } = query;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[lessons] Failed to reload the teacher info:", error);
    });
  }, [refetch]);
  let body: ReactNode = <Skeleton className="h-48 w-full" />;
  if (query.isError) {
    body = <ErrorState level={3} onRetry={retry} />;
  } else if (query.data) {
    body = (
      <InfoTabs
        canAuthor={canAuthor}
        detail={query.data}
        languages={languages}
      />
    );
  }
  return (
    <Card className="gap-3 sm:p-4" id="teacher-info">
      <CardContent className="gap-4">
        <CardTitle className="text-body" level={2}>
          {t("admin.teacherInfo.title")}
        </CardTitle>
        <Text size="body-sm" tone="muted">
          {t("admin.teacherInfo.description")}
        </Text>
        {body}
      </CardContent>
    </Card>
  );
}

/**
 * The card for whoever may see it: a teacher, a translator or an admin
 * (nothing for anyone else; the procedures refuse them anyway). A teacher or
 * an admin authors every language, a translator only the non-default ones.
 */
export function TeacherInfoPanel({
  gestureId,
}: {
  gestureId: string;
}): ReactNode {
  const roles = useAuthState().user?.roles ?? [];
  const canAuthor = roles.includes("admin") || roles.includes("teacher");
  if (!(canAuthor || roles.includes("translator"))) {
    return null;
  }
  return <TeacherInfoCard canAuthor={canAuthor} gestureId={gestureId} />;
}
