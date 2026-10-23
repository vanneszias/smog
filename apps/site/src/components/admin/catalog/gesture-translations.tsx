import {
  isStaleTranslation,
  useCatalogTranslationMutations,
  useTranslatableGesture,
} from "@smog/admin/client";
import {
  GESTURE_DESCRIPTION_MAX,
  GESTURE_NAME_MAX,
  type TranslatableGesture,
} from "@smog/admin/schema";
import type { LanguageInfo } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardTitle,
  ErrorState,
  Field,
  Input,
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
  useRef,
  useState,
} from "react";
import { useLocale } from "@/lib/locale";
import { KeywordInput } from "./keyword-input";

type Translation = TranslatableGesture["translations"][string];

interface TextDraft {
  description: string;
  keywords: string[];
  name: string;
}

const EMPTY: TextDraft = { description: "", keywords: [], name: "" };

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameDraft(a: TextDraft, b: TextDraft): boolean {
  return (
    a.name === b.name &&
    a.description === b.description &&
    sameList(a.keywords, b.keywords)
  );
}

function draftOf(translation: Translation | undefined): TextDraft {
  return translation
    ? {
        description: translation.description,
        keywords: translation.keywords,
        name: translation.name,
      }
    : EMPTY;
}

/**
 * Whether the saved translation still leaves the default text on show: no
 * translated name, or a blank description or no keywords where the default
 * language has some (the same rule as the report and the list filter).
 */
function translationNeeded(
  gesture: TranslatableGesture,
  locale: string
): boolean {
  const translation = gesture.translations[locale];
  if (!translation) {
    return true;
  }
  return (
    (translation.description === "" && gesture.source.description !== "") ||
    (translation.keywords.length === 0 && gesture.source.keywords.length > 0)
  );
}

function SourceText({
  gesture,
  language,
}: {
  gesture: TranslatableGesture;
  language: LanguageInfo;
}): ReactNode {
  const { t } = useTranslation();
  const { source } = gesture;
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md bg-surface-sunken p-4">
      <Text size="body-sm" tone="muted" weight="medium">
        {t("admin.catalogTranslation.sourceLabel", { language: language.name })}
      </Text>
      <Text lang={language.code} weight="medium">
        {source.name}
      </Text>
      {source.description ? (
        <Text lang={language.code} size="body-sm">
          {source.description}
        </Text>
      ) : null}
      {source.keywords.length > 0 ? (
        <Text lang={language.code} size="body-sm" tone="muted">
          {source.keywords.join(", ")}
        </Text>
      ) : null}
    </div>
  );
}

/** One language's editor: the default text beside the fields, one save. */
function LanguageForm({
  gesture,
  language,
  defaultLanguage,
}: {
  defaultLanguage: LanguageInfo;
  gesture: TranslatableGesture;
  language: LanguageInfo;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { saveGesture } = useCatalogTranslationMutations();
  const saved = gesture.translations[language.code];
  const savedAt = saved?.updatedAt ?? null;
  const [draft, setDraft] = useState<TextDraft>(() => draftOf(saved));
  // The text the draft started from, and the version (`updatedAt`) a save
  // is checked against. Another translator's save arrives as a new `saved`:
  // an untouched form takes it, an edited one keeps the draft and offers
  // their text (like the strings table); the form is never remounted.
  const [base, setBase] = useState<TextDraft>(() => draftOf(saved));
  const [expected, setExpected] = useState<number | null>(savedAt);
  const [conflict, setConflict] = useState<{
    theirs: TextDraft;
    updatedAt: number | null;
  } | null>(null);
  const [tried, setTried] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const dirty = !sameDraft(draft, base);
  useEffect(() => {
    if (savedAt === expected || savedAt === conflict?.updatedAt) {
      return;
    }
    const theirs = draftOf(saved);
    if (sameDraft(draft, theirs) || sameDraft(draft, base)) {
      setDraft(theirs);
      setBase(theirs);
      setExpected(savedAt);
      setConflict(null);
    } else {
      setConflict({ theirs, updatedAt: savedAt });
    }
  }, [base, conflict?.updatedAt, draft, expected, saved, savedAt]);
  const takeTheirs = useCallback(() => {
    if (conflict) {
      setDraft(conflict.theirs);
      setBase(conflict.theirs);
      setExpected(conflict.updatedAt);
      setConflict(null);
    }
  }, [conflict]);
  const keepMine = useCallback(() => {
    if (conflict) {
      setBase(conflict.theirs);
      setExpected(conflict.updatedAt);
      setConflict(null);
    }
  }, [conflict]);
  const nameMissing = draft.name.trim() === "";

  const onName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      setDraft((previous) => ({ ...previous, name: event.target.value })),
    []
  );
  const onDescription = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      setDraft((previous) => ({
        ...previous,
        description: event.target.value,
      })),
    []
  );
  const onKeywords = useCallback(
    (keywords: string[]) => setDraft((previous) => ({ ...previous, keywords })),
    []
  );
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setTried(true);
      if (nameMissing) {
        return;
      }
      saveGesture
        .mutateAsync({
          description: draft.description,
          expectedUpdatedAt: expected,
          id: gesture.id,
          keywords: draft.keywords,
          locale: language.code,
          name: draft.name,
        })
        .then(() => {
          setTried(false);
          // The Save button is disabled again: keep the keyboard in the form.
          if (document.activeElement?.tagName !== "INPUT") {
            nameField.current?.focus();
          }
          toast({
            title: t("admin.catalogTranslation.saved"),
            variant: "success",
          });
        })
        .catch((error: unknown) => {
          console.error(
            "[admin] Failed to save the gesture translation:",
            error
          );
          toast({
            title: isStaleTranslation(error)
              ? t("admin.catalogTranslation.stale")
              : t("admin.catalogTranslation.saveFailed"),
            variant: "danger",
          });
        });
    },
    [
      draft,
      expected,
      gesture.id,
      language.code,
      nameMissing,
      saveGesture,
      t,
      toast,
    ]
  );
  const names = { language: language.name };
  return (
    <form
      className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2"
      noValidate
      onSubmit={submit}
    >
      <SourceText gesture={gesture} language={defaultLanguage} />
      <div className="flex min-w-0 flex-col gap-4">
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
                {[
                  conflict.theirs.name,
                  conflict.theirs.description,
                  conflict.theirs.keywords.join(", "),
                ]
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
        <Field
          counter={{ count: draft.name.trim().length, max: GESTURE_NAME_MAX }}
          error={
            tried && nameMissing
              ? t("admin.catalogTranslation.nameRequired")
              : undefined
          }
          label={t("admin.catalogTranslation.fields.name", names)}
          required
        >
          <Input
            autoComplete="off"
            lang={language.code}
            onChange={onName}
            placeholder={gesture.source.name}
            ref={nameField}
            value={draft.name}
          />
        </Field>
        <Field
          counter={{
            count: draft.description.trim().length,
            max: GESTURE_DESCRIPTION_MAX,
          }}
          label={t("admin.catalogTranslation.fields.description", names)}
          optional
        >
          <Textarea
            lang={language.code}
            onChange={onDescription}
            rows={4}
            value={draft.description}
          />
        </Field>
        <KeywordInput
          hint={t("admin.catalogTranslation.fallbackHint")}
          label={t("admin.catalogTranslation.fields.keywords", names)}
          onChange={onKeywords}
          value={draft.keywords}
        />
        <div>
          <Button
            disabled={!dirty || conflict !== null}
            icon={<Save />}
            loading={saveGesture.isPending}
            type="submit"
          >
            {t("admin.catalogTranslation.save")}
          </Button>
        </div>
      </div>
    </form>
  );
}

function TranslationTabs({
  gesture,
  languages,
}: {
  gesture: TranslatableGesture;
  languages: readonly LanguageInfo[];
}): ReactNode {
  const { t } = useTranslation();
  const defaultLanguage = languages.find((language) => language.isDefault);
  const targets = languages.filter((language) => !language.isDefault);
  const [first] = targets;
  const [active, setActive] = useState(first?.code ?? "");
  if (!(first && defaultLanguage)) {
    return (
      <Text size="body-sm" tone="muted">
        {t("admin.catalogTranslation.noLanguages")}
      </Text>
    );
  }
  return (
    <Tabs onValueChange={setActive} value={active}>
      <TabsList aria-label={t("admin.catalogTranslation.tabsLabel")}>
        {targets.map((language) => (
          <TabsTrigger
            key={language.code}
            lang={language.code}
            value={language.code}
          >
            {language.name}
            <Badge
              variant={
                translationNeeded(gesture, language.code)
                  ? "warning"
                  : "success"
              }
            >
              {translationNeeded(gesture, language.code)
                ? t("admin.catalogTranslation.needs")
                : t("admin.catalogTranslation.translated")}
            </Badge>
          </TabsTrigger>
        ))}
      </TabsList>
      {targets.map((language) => (
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
            gesture={gesture}
            language={language}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

/**
 * A gesture's translations in the admin editor: one tab per enabled
 * language (the default language's text beside each, a status badge on the
 * tab). Each tab saves on its own through `catalogTranslation.gestures.save`
 * and does not touch the form above, which edits the default text.
 */
export function GestureTranslations({
  gestureId,
}: {
  gestureId: string;
}): ReactNode {
  const { t } = useTranslation();
  const { languages } = useLocale();
  const query = useTranslatableGesture(gestureId);
  const { refetch } = query;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the translations:", error);
    });
  }, [refetch]);
  let body: ReactNode = <Skeleton className="h-48 w-full" />;
  if (query.isError) {
    body = <ErrorState level={3} onRetry={retry} />;
  } else if (query.data) {
    body = <TranslationTabs gesture={query.data} languages={languages} />;
  }
  return (
    <Card className="gap-3 sm:p-4" id="translations">
      <CardContent className="gap-4">
        <CardTitle className="text-body" level={2}>
          {t("admin.catalogTranslation.title")}
        </CardTitle>
        <Text size="body-sm" tone="muted">
          {t("admin.catalogTranslation.description")}
        </Text>
        {body}
      </CardContent>
    </Card>
  );
}
