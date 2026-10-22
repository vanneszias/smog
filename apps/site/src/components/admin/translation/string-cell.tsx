import type { TranslationKey } from "@smog/i18n";
import { placeholdersOf, validateTranslation } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import type { StringCell, StringRow } from "@smog/translation/schema";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Field,
  Text,
  Textarea,
} from "@smog/ui-web";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useState,
} from "react";

/** A language of the table (its code, its own name and whether it is the source). */
export interface CellLanguage {
  code: string;
  isDefault: boolean;
  name: string;
}

/** What the editor of one cell holds. */
export interface EditorState {
  /** Somebody else's stored text, after a lost save. */
  conflict: StringCell | null;
  draft: string;
  /** The error key of the last refused save. */
  error: TranslationKey | null;
  /** The `updatedAt` the save is checked against. */
  expected: number | null;
}

export const EDITOR_ERRORS = {
  empty: "admin.translation.errors.empty",
  generic: "admin.translation.errors.generic",
  notFound: "admin.translation.errors.notFound",
  placeholders: "admin.translation.errors.placeholders",
  tooLong: "admin.translation.errors.tooLong",
} as const satisfies Record<string, TranslationKey>;

export type EditorErrorCode = keyof typeof EDITOR_ERRORS;

/** The first problem of `value` as an error code, checked before the request (the server checks again). */
function draftProblem(
  language: CellLanguage,
  row: StringRow,
  value: string
): EditorErrorCode | null {
  const [issue] = validateTranslation(
    language.isDefault ? value : row.source,
    value
  ).issues;
  return issue?.code ?? null;
}

export interface CellEditorProps {
  language: CellLanguage;
  onCancel: () => void;
  onSave: (value: string | null, expected: number | null) => void;
  /** Whether a stored override can be removed. */
  overridden: boolean;
  row: StringRow;
  state: EditorState;
}

/**
 * The inline editor of one text: the textarea with its label, the source
 * and the placeholders to keep, Save (Ctrl or Cmd + Enter), Cancel (Escape)
 * and, for a stored override, Revert. After a lost save it shows the other
 * version and lets the person take it or save theirs over it.
 */
export function CellEditor({
  language,
  onCancel,
  onSave,
  overridden,
  row,
  state,
}: CellEditorProps): ReactNode {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(state.draft);
  const [expected, setExpected] = useState(state.expected);
  const [problem, setProblem] = useState<EditorErrorCode | null>(null);
  const [conflict, setConflict] = useState(state.conflict);
  const names = placeholdersOf(row.source);
  const errorKey = problem ? EDITOR_ERRORS[problem] : state.error;
  const onChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value);
    setProblem(null);
  }, []);
  const save = useCallback(() => {
    const found = draftProblem(language, row, draft);
    if (found) {
      setProblem(found);
      return;
    }
    onSave(draft, expected);
  }, [draft, expected, language, onSave, row]);
  const revert = useCallback(() => onSave(null, expected), [expected, onSave]);
  const takeTheirs = useCallback(() => {
    if (conflict) {
      setDraft(conflict.value ?? "");
      setExpected(conflict.updatedAt);
      setConflict(null);
    }
  }, [conflict]);
  const keepMine = useCallback(() => {
    if (conflict) {
      setExpected(conflict.updatedAt);
      setConflict(null);
    }
  }, [conflict]);
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        save();
      }
    },
    [onCancel, save]
  );
  const label = t("admin.translation.editor.label", {
    key: row.key,
    language: language.name,
  });
  return (
    <div
      className="flex min-w-64 flex-col gap-2"
      data-testid={`editor-${language.code}`}
    >
      {conflict ? (
        <Alert variant="warning">
          <AlertTitle>{t("admin.translation.editor.conflictTitle")}</AlertTitle>
          <AlertDescription>
            <span className="block">
              {t("admin.translation.editor.conflictBody")}
            </span>
            <span className="mt-1 block whitespace-pre-wrap break-words font-medium">
              {conflict.value ?? t("admin.translation.cell.missing")}
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
      {language.isDefault ? null : (
        <Text size="caption" tone="muted">
          {t("admin.translation.editor.source")}{" "}
          <span className="whitespace-pre-wrap break-words">{row.source}</span>
        </Text>
      )}
      <Field
        error={
          errorKey ? t(errorKey, { placeholders: names.join(", ") }) : undefined
        }
        hint={
          names.length > 0
            ? t("admin.translation.editor.placeholders", {
                placeholders: names.join(", "),
              })
            : undefined
        }
        label={label}
      >
        <Textarea
          autoFocus
          onChange={onChange}
          onKeyDown={onKeyDown}
          rows={3}
          value={draft}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={conflict !== null} onClick={save} size="sm">
          {t("admin.translation.editor.save")}
        </Button>
        <Button onClick={onCancel} size="sm" variant="secondary">
          {t("admin.translation.editor.cancel")}
        </Button>
        {overridden ? (
          <Button onClick={revert} size="sm" variant="ghost">
            {t("admin.translation.editor.revert")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export interface CellViewProps {
  cell: StringCell;
  language: CellLanguage;
  onConfirm: () => void;
  onEdit: () => void;
  /** The text just saved, shown before the server answers. */
  optimistic: string | undefined;
  row: StringRow;
}

/** The text of one cell as a button that opens its editor, with its status chips. */
export function CellView({
  cell,
  language,
  onConfirm,
  onEdit,
  optimistic,
  row,
}: CellViewProps): ReactNode {
  const { t } = useTranslation();
  if (!cell.applicable) {
    return (
      <Text as="span" size="caption" tone="muted">
        {t("admin.translation.cell.notApplicable")}
      </Text>
    );
  }
  const value = optimistic ?? cell.value;
  const label = t("admin.translation.cell.edit", {
    key: row.key,
    language: language.name,
  });
  return (
    <div className="flex min-w-48 flex-col items-start gap-1">
      <button
        className="min-h-touch w-full max-w-prose rounded-md px-2 py-1 text-left text-body-sm outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-ring"
        data-testid={`cell-${language.code}`}
        onClick={onEdit}
        type="button"
      >
        {/* The name starts with what the button does and then holds the visible text (WCAG 2.5.3 label in name). */}
        <span className="sr-only">{label} </span>
        {value === null ? (
          <span className="text-muted-foreground">
            {t("admin.translation.cell.empty")}
          </span>
        ) : (
          <span className="line-clamp-4 whitespace-pre-wrap break-words">
            {value}
          </span>
        )}
      </button>
      <div className="flex flex-wrap items-center gap-1">
        {cell.missing && optimistic === undefined ? (
          <Badge variant="warning">{t("admin.translation.cell.missing")}</Badge>
        ) : null}
        {cell.stale && optimistic === undefined ? (
          <>
            <Badge variant="warning">{t("admin.translation.cell.stale")}</Badge>
            <Button
              aria-label={t("admin.translation.cell.confirmLabel", {
                key: row.key,
                language: language.name,
              })}
              onClick={onConfirm}
              size="sm"
              variant="ghost"
            >
              {t("admin.translation.cell.confirm")}
            </Button>
          </>
        ) : null}
        {cell.issues.length > 0 && optimistic === undefined ? (
          <Badge variant="danger">
            {t("admin.translation.cell.placeholderIssue")}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
