import { useTranslation } from "@smog/i18n/react";
import {
  stringConflictOf,
  useLanguages,
  useSaveString,
  useTranslationStrings,
  validationCodeOf,
} from "@smog/translation/client";
import type {
  LanguageRow,
  StringCell,
  StringRow,
  StringStatus,
} from "@smog/translation/schema";
import {
  DataTable,
  type DataTableColumn,
  ErrorState,
  Field,
  Pagination,
  SearchField,
  Select,
  Skeleton,
  Text,
  useToast,
} from "@smog/ui-web";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CellEditor,
  type CellLanguage,
  CellView,
  EDITOR_ERRORS,
  type EditorErrorCode,
  type EditorState,
} from "./string-cell";
import {
  STRINGS_PAGE_SIZE,
  type StringsSearch,
  stringsListInput,
} from "./strings-search";

const ALL = "all";
const SEARCH_DELAY_MS = 300;

const STATUS_LABELS = {
  invalid: "admin.translation.filters.statuses.invalid",
  missing: "admin.translation.filters.statuses.missing",
  stale: "admin.translation.filters.statuses.stale",
} as const;

export interface StringsTableProps {
  onSearchChange: (next: StringsSearch) => void;
  search: StringsSearch;
}

function rowKey(row: StringRow): string {
  return row.key;
}

function cellId(key: string, locale: string): string {
  return `${key}\u0000${locale}`;
}

/** The filters: search, section, status and the language the status applies to. */
function Filters({
  languages,
  namespaces,
  onSearchChange,
  search,
}: StringsTableProps & {
  languages: readonly CellLanguage[];
  namespaces: readonly string[];
}): ReactNode {
  const { t } = useTranslation();
  const [query, setQuery] = useState(search.q ?? "");
  // The URL leads: a link that sets `q` (or a reset) shows in the field.
  useEffect(() => setQuery(search.q ?? ""), [search.q]);
  // The URL follows the field after a pause, so each keystroke is not a request.
  useEffect(() => {
    if (query === (search.q ?? "")) {
      return;
    }
    const timer = setTimeout(
      () =>
        onSearchChange({
          ...search,
          page: undefined,
          q: query.trim() === "" ? undefined : query,
        }),
      SEARCH_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [onSearchChange, query, search]);
  const clearQuery = useCallback(() => setQuery(""), []);
  const onNamespace = useCallback(
    (value: string) =>
      onSearchChange({
        ...search,
        ns: value === ALL ? undefined : value,
        page: undefined,
      }),
    [onSearchChange, search]
  );
  const onStatus = useCallback(
    (value: string) =>
      onSearchChange({
        ...search,
        page: undefined,
        status: value === ALL ? undefined : (value as StringStatus),
      }),
    [onSearchChange, search]
  );
  const onLanguage = useCallback(
    (value: string) =>
      onSearchChange({
        ...search,
        lang: value === ALL ? undefined : value,
        page: undefined,
      }),
    [onSearchChange, search]
  );
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <legend className="sr-only">
        {t("admin.translation.filters.label")}
      </legend>
      <Field label={t("admin.translation.filters.search")}>
        <SearchField
          onClear={clearQuery}
          onValueChange={setQuery}
          placeholder={t("admin.translation.filters.searchPlaceholder")}
          value={query}
        />
      </Field>
      <Field label={t("admin.translation.filters.namespace")}>
        <Select
          onValueChange={onNamespace}
          options={[
            { label: t("admin.translation.filters.allNamespaces"), value: ALL },
            ...namespaces.map((value) => ({ label: value, value })),
          ]}
          value={search.ns ?? ALL}
        />
      </Field>
      <Field label={t("admin.translation.filters.status")}>
        <Select
          onValueChange={onStatus}
          options={[
            { label: t("admin.translation.filters.allStatuses"), value: ALL },
            ...(
              Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]
            ).map((value) => ({
              label: t(STATUS_LABELS[value]),
              value,
            })),
          ]}
          value={search.status ?? ALL}
        />
      </Field>
      <Field label={t("admin.translation.filters.language")}>
        <Select
          onValueChange={onLanguage}
          options={[
            { label: t("admin.translation.filters.anyLanguage"), value: ALL },
            ...languages.map((language) => ({
              label: language.name,
              value: language.code,
            })),
          ]}
          value={search.lang ?? ALL}
        />
      </Field>
    </fieldset>
  );
}

interface Editing {
  key: string;
  locale: string;
  state: EditorState;
}

interface LanguageCellProps {
  editing: Editing | null;
  language: CellLanguage;
  onCancel: () => void;
  onEdit: (row: StringRow, locale: string, cell: StringCell) => void;
  onSubmit: (
    row: StringRow,
    locale: string,
    value: string | null,
    expected: number | null
  ) => void;
  optimistic: string | undefined;
  row: StringRow;
}

/** One language's cell of a row: its text and status, or its open editor. */
function LanguageCell({
  editing,
  language,
  onCancel,
  onEdit,
  onSubmit,
  optimistic,
  row,
}: LanguageCellProps): ReactNode {
  const cell = row.cells[language.code];
  const isEditing =
    editing?.key === row.key && editing.locale === language.code;
  const save = useCallback(
    (value: string | null, expected: number | null) =>
      onSubmit(row, language.code, value, expected),
    [language.code, onSubmit, row]
  );
  const confirm = useCallback(() => {
    if (cell) {
      onSubmit(row, language.code, cell.value ?? "", cell.updatedAt);
    }
  }, [cell, language.code, onSubmit, row]);
  const edit = useCallback(() => {
    if (cell) {
      onEdit(row, language.code, cell);
    }
  }, [cell, language.code, onEdit, row]);
  if (!cell) {
    return null;
  }
  if (isEditing) {
    return (
      <CellEditor
        language={language}
        onCancel={onCancel}
        onSave={save}
        overridden={cell.overridden}
        row={row}
        state={editing.state}
      />
    );
  }
  return (
    <CellView
      cell={cell}
      language={language}
      onConfirm={confirm}
      onEdit={edit}
      optimistic={optimistic}
      row={row}
    />
  );
}

/**
 * The strings table (phase 10b task 4): one row per key with a column per
 * enabled language (the default language is the source). A cell opens an
 * inline editor; a save shows at once and is checked by the server, which
 * refuses it with the stored text when somebody else saved first.
 */
export function StringsTable({
  onSearchChange,
  search,
}: StringsTableProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const strings = useTranslationStrings(stringsListInput(search));
  const languageList = useLanguages();
  const save = useSaveString();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [pending, setPending] = useState<Readonly<Record<string, string>>>({});

  const names = useMemo(
    () =>
      new Map(
        (languageList.data?.items ?? []).map((item: LanguageRow) => [
          item.code,
          item,
        ])
      ),
    [languageList.data]
  );
  const languages = useMemo<CellLanguage[]>(
    () =>
      (strings.data?.languages ?? []).map((code) => ({
        code,
        isDefault: names.get(code)?.isDefault ?? false,
        name: names.get(code)?.name ?? code,
      })),
    [names, strings.data]
  );

  const clearPending = useCallback((id: string) => {
    setPending((current) => {
      const { [id]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const submit = useCallback(
    async (
      row: StringRow,
      locale: string,
      value: string | null,
      expected: number | null
    ) => {
      const id = cellId(row.key, locale);
      setEditing(null);
      if (value !== null) {
        setPending((current) => ({ ...current, [id]: value }));
      }
      try {
        await save.mutateAsync({
          expectedUpdatedAt: expected,
          key: row.key,
          locale,
          value,
        });
        clearPending(id);
      } catch (error) {
        clearPending(id);
        const conflict = stringConflictOf(error);
        const code = validationCodeOf(error, "value");
        let errorCode: EditorErrorCode = "generic";
        if (code && code in EDITOR_ERRORS) {
          errorCode = code as EditorErrorCode;
        } else if (
          typeof error === "object" &&
          error !== null &&
          (error as { code?: unknown }).code === "NOT_FOUND"
        ) {
          errorCode = "notFound";
        }
        // Back to the editor with the text, so nothing typed is lost.
        setEditing({
          key: row.key,
          locale,
          state: {
            conflict: conflict?.current ?? null,
            draft: value ?? "",
            error: conflict ? null : EDITOR_ERRORS[errorCode],
            expected,
          },
        });
        if (!conflict) {
          toast({
            title: t("admin.translation.errors.saveFailed"),
            variant: "danger",
          });
        }
      }
    },
    [clearPending, save, t, toast]
  );

  const cancelEditing = useCallback(() => setEditing(null), []);
  const startEditing = useCallback(
    (row: StringRow, locale: string, cell: StringCell) =>
      setEditing({
        key: row.key,
        locale,
        state: {
          conflict: null,
          draft: cell.value ?? "",
          error: null,
          expected: cell.updatedAt,
        },
      }),
    []
  );

  const columns = useMemo<DataTableColumn<StringRow>[]>(
    () => [
      {
        cell: (row) => (
          <code className="break-all text-caption">{row.key}</code>
        ),
        className: "align-top",
        header: t("admin.translation.table.key"),
        id: "key",
      },
      ...languages.map(
        (language): DataTableColumn<StringRow> => ({
          cell: (row) => (
            <LanguageCell
              editing={editing}
              language={language}
              onCancel={cancelEditing}
              onEdit={startEditing}
              onSubmit={submit}
              optimistic={pending[cellId(row.key, language.code)]}
              row={row}
            />
          ),
          className: "align-top",
          header: language.isDefault
            ? t("admin.translation.table.sourceHeader", {
                language: language.name,
              })
            : language.name,
          id: `lang-${language.code}`,
        })
      ),
    ],
    [cancelEditing, editing, languages, pending, startEditing, submit, t]
  );

  const { refetch } = strings;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the strings:", error);
    });
  }, [refetch]);
  const onPage = useCallback(
    (next: number) =>
      onSearchChange({ ...search, page: next === 1 ? undefined : next }),
    [onSearchChange, search]
  );

  if (strings.isError && !strings.data) {
    return (
      <ErrorState
        description={t("admin.translation.loadError")}
        level={2}
        onRetry={retry}
      />
    );
  }
  if (!strings.data) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  const { namespaces, total } = strings.data;
  const page = search.page ?? 1;
  const pageCount = Math.max(1, Math.ceil(total / STRINGS_PAGE_SIZE));
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Filters
        languages={languages}
        namespaces={namespaces}
        onSearchChange={onSearchChange}
        search={search}
      />
      <Text aria-live="polite" size="body-sm" tone="muted">
        {t("admin.translation.table.total", { n: total })}
      </Text>
      <DataTable
        aria-label={t("admin.translation.table.label")}
        columns={columns}
        empty={t("admin.translation.table.empty")}
        getRowId={rowKey}
        rows={strings.data.items}
      />
      {pageCount > 1 ? (
        <Pagination
          onPageChange={onPage}
          page={Math.min(page, pageCount)}
          pageCount={pageCount}
        />
      ) : null}
    </div>
  );
}
