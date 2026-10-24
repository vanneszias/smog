import { LESSON_NOTES_MAX, LESSON_TITLE_MAX } from "@smog/db/enums";
import type { LanguageInfo } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { useLessonActions, useLessonReadiness } from "@smog/lessons/client";
import type {
  LessonDetail,
  LessonItem,
  TeacherCoverageState,
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
  Field,
  Input,
  ProgressBar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  Textarea,
  useToast,
} from "@smog/ui-web";
import { useNavigate } from "@tanstack/react-router";
import { CircleAlert, CircleCheck, Copy, LoaderCircle } from "lucide-react";
import {
  type ChangeEvent,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useMemo,
  useState,
} from "react";
import { LeaveGuard } from "@/components/admin/leave-guard";
import { useLocale } from "@/lib/locale";
import type { PickerDestination } from "./gesture-picker";
import {
  type Autosave,
  type SaveStatus,
  useLessonAutosave,
} from "./lesson-autosave";
import {
  addItems,
  addSection,
  canAddSection,
  gestureCount,
  hasRoom,
  moveItem,
  removeItem,
  removeSection,
  renameSection,
  reorderItems,
  reorderSections,
  type SectionRef,
  setNumber,
  setText,
} from "./lesson-draft";
import { LessonExportButton } from "./lesson-export-button";
import {
  Sections,
  StructureActions,
  StructureProvider,
  type StructureValue,
  sectionName,
  UngroupedItems,
} from "./lesson-structure";

// cmdk loads when the picker first opens (heavy blocks are lazy, AGENTS.md).
const GesturePicker = lazy(async () => ({
  default: (await import("./gesture-picker")).GesturePicker,
}));

const STATUS_KEYS = {
  conflict: "admin.lessons.status.conflict",
  dirty: "admin.lessons.status.dirty",
  error: "admin.lessons.status.error",
  invalid: "admin.lessons.status.invalid",
  saved: "admin.lessons.status.saved",
  saving: "admin.lessons.status.saving",
} as const satisfies Record<SaveStatus, string>;

/** The visible, spoken save state ("All changes saved", "Saving…", …). */
function SaveIndicator({ auto }: { auto: Autosave }): ReactNode {
  const { t } = useTranslation();
  const { status } = auto;
  let icon: ReactNode = <CircleCheck aria-hidden="true" className="size-4" />;
  if (status === "saving" || status === "dirty") {
    icon = (
      <LoaderCircle
        aria-hidden="true"
        className="size-4 motion-safe:animate-spin"
      />
    );
  } else if (
    status === "error" ||
    status === "invalid" ||
    status === "conflict"
  ) {
    icon = <CircleAlert aria-hidden="true" className="size-4" />;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p
        className="flex items-center gap-2 text-body-sm text-muted-foreground"
        data-status={status}
        data-testid="lesson-save-status"
        role="status"
      >
        {icon}
        {t(STATUS_KEYS[status])}
      </p>
      {status === "error" ? (
        <Button onClick={auto.retry} size="sm" variant="secondary">
          {t("admin.lessons.status.retry")}
        </Button>
      ) : null}
    </div>
  );
}

function ConflictAlert({ auto }: { auto: Autosave }): ReactNode {
  const { t } = useTranslation();
  if (!auto.conflict) {
    return null;
  }
  return (
    <Alert variant="warning">
      <AlertTitle>{t("admin.lessons.conflict.title")}</AlertTitle>
      <AlertDescription>
        <span className="block">
          {t("admin.lessons.conflict.body", {
            author: auto.conflict.authorName ?? t("admin.lessons.noAuthor"),
          })}
        </span>
        <span className="mt-2 flex flex-wrap gap-2">
          <Button onClick={auto.takeTheirs} size="sm" variant="secondary">
            {t("admin.lessons.conflict.useTheirs")}
          </Button>
          <Button onClick={auto.keepMine} size="sm" variant="secondary">
            {t("admin.lessons.conflict.keepMine")}
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}

function TextFields({
  language,
  onNotes,
  onTitle,
  readOnly,
  text,
}: {
  language: LanguageInfo;
  onNotes: (locale: string, value: string) => void;
  onTitle: (locale: string, value: string) => void;
  readOnly: boolean;
  text: { notes: string; title: string };
}): ReactNode {
  const { t } = useTranslation();
  const title = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onTitle(language.code, event.target.value),
    [language.code, onTitle]
  );
  const notes = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      onNotes(language.code, event.target.value),
    [language.code, onNotes]
  );
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("admin.lessons.fields.title")}>
        <Input
          lang={language.code}
          maxLength={LESSON_TITLE_MAX}
          onChange={title}
          readOnly={readOnly}
          value={text.title}
        />
      </Field>
      <Field
        counter={{ count: text.notes.length, max: LESSON_NOTES_MAX }}
        label={t("admin.lessons.fields.notes")}
        optional
      >
        <Textarea
          lang={language.code}
          maxLength={LESSON_NOTES_MAX}
          onChange={notes}
          readOnly={readOnly}
          rows={4}
          value={text.notes}
        />
      </Field>
    </div>
  );
}

/** Title and notes per language (tabs), and the language-neutral lesson number. */
function DetailsCard({
  active,
  auto,
  languages,
  onActive,
  readOnly,
}: {
  active: string;
  auto: Autosave;
  languages: readonly LanguageInfo[];
  onActive: (code: string) => void;
  readOnly: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const { draft, edit } = auto;
  const onTitle = useCallback(
    (locale: string, value: string) =>
      edit((now) => setText(now, locale, "title", value)),
    [edit]
  );
  const onNotes = useCallback(
    (locale: string, value: string) =>
      edit((now) => setText(now, locale, "notes", value)),
    [edit]
  );
  const onNumber = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value.trim();
      const parsed = raw === "" ? null : Number(raw);
      edit((now) =>
        setNumber(
          now,
          parsed !== null && Number.isInteger(parsed) ? parsed : null
        )
      );
    },
    [edit]
  );
  return (
    <Card className="gap-3 sm:p-4">
      <CardContent className="gap-4">
        <CardTitle className="text-body" level={2}>
          {t("admin.lessons.details")}
        </CardTitle>
        <Field
          className="max-w-48"
          hint={t("admin.lessons.numberHint")}
          label={t("admin.lessons.numberLabel")}
          optional
        >
          <Input
            inputMode="numeric"
            max={9999}
            min={0}
            onChange={onNumber}
            readOnly={readOnly}
            type="number"
            value={draft.number === null ? "" : String(draft.number)}
          />
        </Field>
        <Tabs onValueChange={onActive} value={active}>
          <TabsList aria-label={t("admin.lessons.tabsLabel")}>
            {languages.map((language) => {
              const filled =
                (draft.translations[language.code]?.title ?? "").trim() !== "";
              return (
                <TabsTrigger
                  key={language.code}
                  lang={language.code}
                  value={language.code}
                >
                  {language.name}
                  <Badge variant={filled ? "success" : "neutral"}>
                    {filled
                      ? t("admin.lessons.tabFilled")
                      : t("admin.lessons.tabEmpty")}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>
          {languages.map((language) => (
            <TabsContent
              forceMount
              hidden={active !== language.code}
              key={language.code}
              value={language.code}
            >
              <TextFields
                language={language}
                onNotes={onNotes}
                onTitle={onTitle}
                readOnly={readOnly}
                text={
                  draft.translations[language.code] ?? { notes: "", title: "" }
                }
              />
            </TabsContent>
          ))}
        </Tabs>
        {auto.problem ? (
          <Text role="status" size="body-sm" tone="warning">
            {t(`admin.lessons.problem.${auto.problem}`)}
          </Text>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** "12 of 14 gestures have teacher info in French", with the bar. */
function ReadinessBar({
  language,
  state,
}: {
  language: LanguageInfo;
  state: { fallback: number; none: number; own: number; total: number } | null;
}): ReactNode {
  const { t } = useTranslation();
  if (!state || state.total === 0) {
    return (
      <Text size="body-sm" tone="muted">
        {t("admin.lessons.readiness.empty")}
      </Text>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid="lesson-readiness">
      <ProgressBar
        label={t("admin.lessons.readiness.label", { language: language.name })}
        max={state.total}
        tone={state.own === state.total ? "success" : "primary"}
        value={state.own}
      />
      <Text size="body-sm">
        {t("admin.lessons.readiness.summary", {
          language: language.name,
          own: state.own,
          total: state.total,
        })}
      </Text>
      {state.fallback > 0 || state.none > 0 ? (
        <Text size="body-sm" tone="muted">
          {[
            state.fallback > 0
              ? t("admin.lessons.readiness.fallback", { count: state.fallback })
              : "",
            state.none > 0
              ? t("admin.lessons.readiness.none", { count: state.none })
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        </Text>
      ) : null}
    </div>
  );
}

function Builder({
  lesson,
  readOnly,
}: {
  lesson: LessonDetail;
  readOnly: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { locale, languages: enabled } = useLocale();
  const { duplicate, save } = useLessonActions();
  const auto = useLessonAutosave(lesson, save.mutateAsync);
  const { draft, edit } = auto;
  // The default language first: its text is the placeholder of every other.
  const languages = useMemo(
    () =>
      [...enabled].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
    [enabled]
  );
  const defaultLocale = languages.find((l) => l.isDefault)?.code ?? "nl";
  const first = languages.find((l) => l.code === locale) ?? languages[0];
  const [active, setActive] = useState(first?.code ?? defaultLocale);
  const activeLanguage = languages.find((l) => l.code === active) ?? first;
  const [picking, setPicking] = useState(false);

  const readiness = useLessonReadiness(lesson.id, active, auto.version);
  const states = useMemo(
    () =>
      new Map<string, TeacherCoverageState>(
        (readiness.data?.items ?? []).map((item) => [
          item.gestureId,
          item.state,
        ])
      ),
    [readiness.data]
  );

  const reorderItemsTo = useCallback(
    (within: SectionRef, ids: readonly string[]): Promise<void> => {
      edit((now) => reorderItems(now, within, ids));
      return Promise.resolve();
    },
    [edit]
  );
  const reorderSectionsTo = useCallback(
    (ids: readonly string[]): Promise<void> => {
      edit((now) => reorderSections(now, ids));
      return Promise.resolve();
    },
    [edit]
  );
  const onRemoveItem = useCallback(
    (gestureId: string) => edit((now) => removeItem(now, gestureId)),
    [edit]
  );
  const onMoveItem = useCallback(
    (gestureId: string, to: SectionRef) =>
      edit((now) => moveItem(now, gestureId, to)),
    [edit]
  );
  const onRemoveSection = useCallback(
    (id: string) => edit((now) => removeSection(now, id)),
    [edit]
  );
  const onRenameSection = useCallback(
    (id: string, title: string) =>
      edit((now) => renameSection(now, id, active, title)),
    [active, edit]
  );
  const onAddSection = useCallback(() => {
    edit((now) => addSection(now, crypto.randomUUID(), {}));
  }, [edit]);
  const onAddGesture = useCallback(
    (item: LessonItem, to: SectionRef) =>
      edit((now) => addItems(now, [item], to)),
    [edit]
  );

  const structure = useMemo<StructureValue>(
    () => ({
      activeLocale: active,
      defaultLocale,
      draft,
      onMoveItem,
      onRemoveItem,
      onRemoveSection,
      onRenameSection,
      onReorderItems: reorderItemsTo,
      onReorderSections: reorderSectionsTo,
      readiness: states,
      readOnly,
    }),
    [
      active,
      defaultLocale,
      draft,
      onMoveItem,
      onRemoveItem,
      onRemoveSection,
      onRenameSection,
      readOnly,
      reorderItemsTo,
      reorderSectionsTo,
      states,
    ]
  );
  const untitled = useCallback(
    (n: number) => t("admin.lessons.section.untitled", { number: n }),
    [t]
  );
  const destinations = useMemo<PickerDestination[]>(
    () => [
      { label: t("admin.lessons.section.ungrouped"), value: null },
      ...draft.sections.map((section, index) => ({
        label: sectionName(section, index, active, defaultLocale, untitled),
        value: section.id,
      })),
    ],
    [active, defaultLocale, draft.sections, t, untitled]
  );
  const held = useMemo(
    () =>
      new Set([
        ...draft.ungrouped.map((item) => item.id),
        ...draft.sections.flatMap((section) =>
          section.items.map((item) => item.id)
        ),
      ]),
    [draft]
  );
  const openPicker = useCallback(() => setPicking(true), []);
  const makeCopy = useCallback(() => {
    duplicate
      .mutateAsync({ id: lesson.id })
      .then(async (created) => {
        toast({ title: t("admin.lessons.duplicated"), variant: "success" });
        await navigate({
          params: { id: created.id },
          to: "/admin/lessons/$id",
        });
      })
      .catch((error: unknown) => {
        console.error("[lessons] Failed to duplicate the lesson:", error);
        toast({ title: t("admin.lessons.duplicateFailed"), variant: "danger" });
      });
  }, [duplicate, lesson.id, navigate, t, toast]);
  const shouldBlock = useCallback(
    () => !readOnly && auto.status !== "saved",
    [auto.status, readOnly]
  );

  return (
    <div className="flex flex-col gap-5">
      {readOnly ? null : <LeaveGuard shouldBlock={shouldBlock} />}
      {readOnly ? (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              {t("admin.lessons.readOnly", {
                author: lesson.authorName ?? t("admin.lessons.noAuthor"),
              })}
            </span>
            <Button
              icon={<Copy />}
              loading={duplicate.isPending}
              onClick={makeCopy}
              size="sm"
              variant="secondary"
            >
              {t("admin.lessons.actions.duplicate")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <SaveIndicator auto={auto} />
      )}
      {readOnly ? null : <ConflictAlert auto={auto} />}
      <DetailsCard
        active={active}
        auto={auto}
        languages={languages}
        onActive={setActive}
        readOnly={readOnly}
      />
      <Card className="gap-3 sm:p-4">
        <CardContent className="gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-body" level={2}>
              {t("admin.lessons.structure")}
            </CardTitle>
            <span className="flex flex-wrap items-center gap-3">
              <Text size="body-sm" tone="muted">
                {t("admin.lessons.count", { count: gestureCount(draft) })}
              </Text>
              <LessonExportButton
                lessonId={lesson.id}
                pending={!readOnly && auto.status !== "saved"}
                version={auto.version}
              />
            </span>
          </div>
          {activeLanguage ? (
            <ReadinessBar
              language={activeLanguage}
              state={readiness.data ?? null}
            />
          ) : null}
          <StructureProvider value={structure}>
            <UngroupedItems />
            <Sections />
          </StructureProvider>
          {readOnly ? null : (
            <StructureActions
              canAddSection={canAddSection(draft)}
              hasRoom={hasRoom(draft)}
              onAddGestures={openPicker}
              onAddSection={onAddSection}
            />
          )}
        </CardContent>
      </Card>
      {readOnly ? null : (
        <Suspense fallback={null}>
          {picking ? (
            <GesturePicker
              destinations={destinations}
              full={!hasRoom(draft)}
              held={held}
              onAdd={onAddGesture}
              onOpenChange={setPicking}
              open={picking}
            />
          ) : null}
        </Suspense>
      )}
    </div>
  );
}

/**
 * The lesson builder (spec 5.3): the details (title and notes per language,
 * the number), the sections and gestures in order with the picker, the
 * readiness of the active language and an autosave under the stale-lock. The
 * author and admins edit; every other teacher reads and can copy the lesson.
 * Mounted once per lesson id: it starts from the lesson it is given.
 */
export function LessonBuilder({ lesson }: { lesson: LessonDetail }): ReactNode {
  return <Builder key={lesson.id} lesson={lesson} readOnly={!lesson.canEdit} />;
}
