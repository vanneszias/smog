import {
  isStaleTranslation,
  useCatalogTranslationMutations,
  useTranslationCategories,
} from "@smog/admin/client";
import {
  CATEGORY_NAME_MAX,
  type TranslationCategoryRow,
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
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
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

/** One category: its default name, the translated name to type, one save. */
function CategoryRow({
  language,
  row,
}: {
  language: LanguageInfo;
  row: TranslationCategoryRow;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { saveCategory } = useCatalogTranslationMutations();
  const stored = row.translation?.name ?? "";
  const storedAt = row.translation?.updatedAt ?? null;
  // The row is never remounted: `base` is the stored name the field started
  // from and `expected` the version a save is checked against. Another
  // translator's save replaces an untouched field, and for an edited one
  // offers their name next to the draft (like the strings table).
  const [name, setName] = useState(stored);
  const [base, setBase] = useState(stored);
  const [expected, setExpected] = useState<number | null>(storedAt);
  const [conflict, setConflict] = useState<{
    theirs: string;
    updatedAt: number | null;
  } | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (storedAt === expected || storedAt === conflict?.updatedAt) {
      return;
    }
    if (name === stored || name === base) {
      setName(stored);
      setBase(stored);
      setExpected(storedAt);
      setConflict(null);
    } else {
      setConflict({ theirs: stored, updatedAt: storedAt });
    }
  }, [base, conflict?.updatedAt, expected, name, stored, storedAt]);
  const takeTheirs = useCallback(() => {
    if (conflict) {
      setName(conflict.theirs);
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
  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setName(event.target.value),
    []
  );
  const trimmed = name.trim();
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (trimmed === "") {
        return;
      }
      saveCategory
        .mutateAsync({
          expectedUpdatedAt: expected,
          id: row.id,
          locale: language.code,
          name: trimmed,
        })
        .then(() => {
          // The Save button is disabled again: keep the keyboard in the row.
          if (document.activeElement?.tagName !== "INPUT") {
            field.current?.focus();
          }
          toast({
            title: t("admin.catalogTranslation.categories.saved"),
            variant: "success",
          });
        })
        .catch((error: unknown) => {
          console.error("[admin] Failed to save the category name:", error);
          toast({
            title: isStaleTranslation(error)
              ? t("admin.catalogTranslation.stale")
              : t("admin.catalogTranslation.saveFailed"),
            variant: "danger",
          });
        });
    },
    [expected, language.code, row.id, saveCategory, t, toast, trimmed]
  );
  const label = t("admin.catalogTranslation.categories.nameIn", {
    language: language.name,
  });
  return (
    <li>
      {conflict ? (
        <Alert className="mt-3" variant="warning">
          <AlertTitle>{t("admin.translation.editor.conflictTitle")}</AlertTitle>
          <AlertDescription>
            <span className="block">
              {t("admin.translation.editor.conflictBody")}
            </span>
            <span
              className="mt-1 block whitespace-pre-wrap break-words font-medium"
              lang={language.code}
            >
              {conflict.theirs}
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
      <form
        className="flex flex-wrap items-end gap-3 border-border-subtle border-b py-3"
        noValidate
        onSubmit={submit}
      >
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <Text size="body-sm" tone="muted">
            {row.name}
          </Text>
          <Input
            aria-label={`${label}: ${row.name}`}
            autoComplete="off"
            lang={language.code}
            maxLength={CATEGORY_NAME_MAX}
            onChange={onChange}
            placeholder={row.name}
            ref={field}
            value={name}
          />
        </div>
        <Badge variant={row.needsTranslation ? "warning" : "success"}>
          {row.needsTranslation
            ? t("admin.catalogTranslation.needs")
            : t("admin.catalogTranslation.translated")}
        </Badge>
        <Button
          aria-label={t("admin.catalogTranslation.categories.saveFor", {
            name: row.name,
          })}
          disabled={trimmed === "" || trimmed === base || conflict !== null}
          icon={<Save />}
          loading={saveCategory.isPending}
          type="submit"
          variant="secondary"
        >
          {t("admin.catalogTranslation.categories.save")}
        </Button>
      </form>
    </li>
  );
}

function LanguageCategories({
  language,
}: {
  language: LanguageInfo;
}): ReactNode {
  const query = useTranslationCategories(language.code);
  const { refetch } = query;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the category names:", error);
    });
  }, [refetch]);
  if (query.isError) {
    return <ErrorState level={3} onRetry={retry} />;
  }
  if (!query.data) {
    return <Skeleton className="h-48 w-full" />;
  }
  return (
    <ul className="flex max-w-content flex-col">
      {query.data.items.map((row) => (
        <CategoryRow key={row.id} language={language} row={row} />
      ))}
    </ul>
  );
}

/**
 * The categories' names in every enabled non-default language (a tab per
 * language, the default name above each field and "needs translation" until
 * it is translated). Each row saves on its own through
 * `catalogTranslation.categories.save`.
 */
export function CategoryTranslations(): ReactNode {
  const { t } = useTranslation();
  const { languages } = useLocale();
  const targets = languages.filter((language) => !language.isDefault);
  const [first] = targets;
  const [active, setActive] = useState(first?.code ?? "");
  return (
    <Card className="gap-3 sm:p-4">
      <CardContent className="gap-4">
        <CardTitle className="text-body" level={2}>
          {t("admin.catalogTranslation.categories.title")}
        </CardTitle>
        <Text size="body-sm" tone="muted">
          {t("admin.catalogTranslation.categories.description")}
        </Text>
        {first ? (
          <Tabs onValueChange={setActive} value={active}>
            <TabsList aria-label={t("admin.catalogTranslation.tabsLabel")}>
              {targets.map((language) => (
                <TabsTrigger
                  key={language.code}
                  lang={language.code}
                  value={language.code}
                >
                  {language.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {targets.map((language) => (
              // Every tab stays mounted (hidden when inactive): an unsaved
              // name survives a switch to another language and back.
              <TabsContent
                forceMount
                hidden={active !== language.code}
                key={language.code}
                value={language.code}
              >
                <LanguageCategories language={language} />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <Text size="body-sm" tone="muted">
            {t("admin.catalogTranslation.noLanguages")}
          </Text>
        )}
      </CardContent>
    </Card>
  );
}
