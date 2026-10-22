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
  const [name, setName] = useState(stored);
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
          expectedUpdatedAt: row.translation?.updatedAt ?? null,
          id: row.id,
          locale: language.code,
          name: trimmed,
        })
        .then(() =>
          toast({
            title: t("admin.catalogTranslation.categories.saved"),
            variant: "success",
          })
        )
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
    [
      language.code,
      row.id,
      row.translation?.updatedAt,
      saveCategory,
      t,
      toast,
      trimmed,
    ]
  );
  const label = t("admin.catalogTranslation.categories.nameIn", {
    language: language.name,
  });
  return (
    <li>
      <form
        className="flex flex-wrap items-end gap-3 border-border-subtle border-b py-3"
        lang={language.code}
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
            maxLength={CATEGORY_NAME_MAX}
            onChange={onChange}
            placeholder={row.name}
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
          disabled={trimmed === "" || trimmed === stored}
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
        <CategoryRow
          // A fresh row whenever the stored name changed.
          key={`${row.id}:${row.translation?.updatedAt ?? 0}`}
          language={language}
          row={row}
        />
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
          <Tabs defaultValue={first.code}>
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
              <TabsContent key={language.code} value={language.code}>
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
