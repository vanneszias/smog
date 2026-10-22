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
  language: string;
}): ReactNode {
  const { t } = useTranslation();
  const { source } = gesture;
  return (
    <div
      className="flex min-w-0 flex-col gap-3 rounded-md bg-surface-sunken p-4"
      lang={language}
    >
      <Text size="body-sm" tone="muted" weight="medium">
        {t("admin.catalogTranslation.sourceLabel", { language })}
      </Text>
      <Text weight="medium">{source.name}</Text>
      {source.description ? (
        <Text size="body-sm">{source.description}</Text>
      ) : null}
      {source.keywords.length > 0 ? (
        <Text size="body-sm" tone="muted">
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
  const [draft, setDraft] = useState<TextDraft>(() => draftOf(saved));
  const [tried, setTried] = useState(false);
  const base = draftOf(saved);
  const dirty =
    draft.name !== base.name ||
    draft.description !== base.description ||
    !sameList(draft.keywords, base.keywords);
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
          expectedUpdatedAt: saved?.updatedAt ?? null,
          id: gesture.id,
          keywords: draft.keywords,
          locale: language.code,
          name: draft.name,
        })
        .then(() => {
          setTried(false);
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
      gesture.id,
      language.code,
      nameMissing,
      saveGesture,
      saved?.updatedAt,
      t,
      toast,
    ]
  );
  const names = { language: language.name };
  return (
    <form
      className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2"
      lang={language.code}
      noValidate
      onSubmit={submit}
    >
      <SourceText gesture={gesture} language={defaultLanguage.name} />
      <div className="flex min-w-0 flex-col gap-4">
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
            onChange={onName}
            placeholder={gesture.source.name}
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
            disabled={!dirty}
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
  if (!(first && defaultLanguage)) {
    return (
      <Text size="body-sm" tone="muted">
        {t("admin.catalogTranslation.noLanguages")}
      </Text>
    );
  }
  return (
    <Tabs defaultValue={first.code}>
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
        <TabsContent key={language.code} value={language.code}>
          <LanguageForm
            defaultLanguage={defaultLanguage}
            gesture={gesture}
            // A fresh form whenever the stored text changed (a save, or
            // another translator's, loaded after a conflict).
            key={`${language.code}:${gesture.translations[language.code]?.updatedAt ?? 0}`}
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
