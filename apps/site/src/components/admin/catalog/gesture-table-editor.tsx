import { staleIdsOf, useAdminGestureMutations } from "@smog/admin/client";
import {
  type AdminCategory,
  type AdminGestureRow,
  GESTURE_DESCRIPTION_MAX,
  GESTURE_NAME_MAX,
  SAVE_MANY_MAX,
} from "@smog/admin/schema";
import type { TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  AlertDialog,
  Badge,
  Button,
  cn,
  DataTable,
  type DataTableColumn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  Input,
  Text,
  Textarea,
  useToast,
} from "@smog/ui-web";
import { Pencil, Save, TriangleAlert, Undo2, X } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { CategoryPicker, pickerCategories } from "./category-picker";
import { ChangesDialog } from "./changes-dialog";
import { KeywordInput } from "./keyword-input";
import { useListFormat } from "./labels";
import {
  changesOf,
  editedValues,
  invalidFields,
  rebaseEdits,
  resolveConflicts,
  saveManyItems,
  setEdit,
  type TableConflicts,
  type TableEdits,
  type TableField,
  type TableValues,
} from "./table-edits";

type OnEdit = <F extends TableField>(
  row: AdminGestureRow,
  field: F,
  value: TableValues[F]
) => void;

const NO_EDITS: TableEdits = new Map();

const FIELD_KEYS = {
  categoryIds: "admin.gestures.fields.categoryIds",
  description: "admin.gestures.fields.description",
  keywords: "admin.gestures.fields.keywords",
  name: "admin.gestures.fields.name",
  playbackId: "admin.gestures.fields.playbackId",
} as const satisfies Record<TableField, TranslationKey>;

/** What an invalid cell says (the contract's own rule for the field). */
const FIELD_ERROR_KEYS = {
  categoryIds: "admin.gestures.editor.categoriesRequired",
  description: "admin.gestures.editor.descriptionTooLong",
  keywords: "admin.gestures.table.keywordsInvalid",
  name: "admin.gestures.editor.nameRequired",
  playbackId: "admin.mux.playback.invalid",
} as const satisfies Record<TableField, TranslationKey>;

/** The field names inside the overwrite confirmation's sentence. */
const FIELD_NAME_KEYS = {
  categoryIds: "admin.gestures.conflict.fieldNames.categoryIds",
  description: "admin.gestures.conflict.fieldNames.description",
  keywords: "admin.gestures.conflict.fieldNames.keywords",
  name: "admin.gestures.conflict.fieldNames.name",
  playbackId: "admin.gestures.conflict.fieldNames.video",
} as const satisfies Record<TableField, TranslationKey>;

const TEXT_MAX = {
  description: GESTURE_DESCRIPTION_MAX,
  name: GESTURE_NAME_MAX,
};

interface CellState {
  changed: boolean;
  describedBy: string | undefined;
  error: string | undefined;
  ids: { changed: string; counter: string; error: string };
  invalid: boolean;
}

/** A cell's changed and invalid state, with the ids its control points at. */
function useCellState(
  edits: TableEdits,
  row: AdminGestureRow,
  field: TableField,
  counter = false
): CellState {
  const { t } = useTranslation();
  const id = useId();
  const changed = edits.get(row.id)?.patch[field] !== undefined;
  const invalid = invalidFields(edits.get(row.id)).has(field);
  const ids = {
    changed: `${id}-changed`,
    counter: `${id}-counter`,
    error: `${id}-error`,
  };
  const describedBy =
    [
      invalid ? ids.error : null,
      changed ? ids.changed : null,
      changed && counter ? ids.counter : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return {
    changed,
    describedBy,
    error: invalid ? t(FIELD_ERROR_KEYS[field]) : undefined,
    ids,
    invalid,
  };
}

/**
 * A cell's frame: a changed cell gets the primary border, a dot and
 * "changed" for screen readers (never only a colour, and never the focus
 * ring's colour); an invalid one says why under it.
 */
function CellShell({
  children,
  counter,
  state,
}: {
  children: ReactNode;
  counter?: { count: number; max: number } | undefined;
  state: CellState;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        {children}
        {state.changed ? (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 size-2.5 rounded-full bg-primary ring-2 ring-surface"
          />
        ) : null}
      </div>
      {state.changed ? (
        <span className="sr-only" id={state.ids.changed}>
          {t("admin.gestures.table.changedCell")}
        </span>
      ) : null}
      {state.changed && counter ? (
        <span
          className="text-caption text-foreground-muted tabular-nums"
          id={state.ids.counter}
        >
          {t("kit.characterCount", counter)}
        </span>
      ) : null}
      {state.error ? (
        <span className="text-caption text-danger-strong" id={state.ids.error}>
          {state.error}
        </span>
      ) : null}
    </div>
  );
}

const changedControl =
  "data-[changed=true]:border-primary data-[changed=true]:bg-primary-subtle/40";

function TextCell({
  edits,
  field,
  onEdit,
  row,
}: {
  edits: TableEdits;
  field: "description" | "name" | "playbackId";
  onEdit: OnEdit;
  row: AdminGestureRow;
}): ReactNode {
  const { t } = useTranslation();
  const max = field === "playbackId" ? undefined : TEXT_MAX[field];
  const state = useCellState(edits, row, field, max !== undefined);
  const value = editedValues(edits, row)[field];
  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onEdit(row, field, event.target.value),
    [field, onEdit, row]
  );
  // Escape restores the value as read.
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        onEdit(row, field, editedValues(NO_EDITS, row)[field]);
      }
    },
    [field, onEdit, row]
  );
  const common = {
    "aria-describedby": state.describedBy,
    "aria-label": t("admin.gestures.table.cell", {
      field: t(FIELD_KEYS[field]),
      name: row.name,
    }),
    "data-changed": state.changed || undefined,
    invalid: state.invalid,
    maxLength: max,
    onChange,
    onKeyDown,
    value,
  };
  return (
    <CellShell
      counter={max === undefined ? undefined : { count: value.length, max }}
      state={state}
    >
      {field === "description" ? (
        // A textarea keeps line breaks (an <input> strips them).
        <Textarea
          {...common}
          className={cn("min-h-touch min-w-[16rem] py-2", changedControl)}
          rows={2}
        />
      ) : (
        <Input
          {...common}
          autoComplete="off"
          className={cn("min-w-[10rem]", changedControl)}
          spellCheck={field !== "playbackId"}
        />
      )}
    </CellShell>
  );
}

/** A list cell (categories, keywords): its value, and a dialog to edit it. */
function ListCell({
  categories,
  edits,
  field,
  onEdit,
  row,
}: {
  categories: readonly AdminCategory[];
  edits: TableEdits;
  field: "categoryIds" | "keywords";
  onEdit: OnEdit;
  row: AdminGestureRow;
}): ReactNode {
  const { t } = useTranslation();
  const list = useListFormat();
  const [open, setOpen] = useState(false);
  const state = useCellState(edits, row, field);
  const values = editedValues(edits, row);
  const picker = useMemo(() => pickerCategories(categories), [categories]);
  const names = useMemo(() => {
    const byId = new Map(categories.map((category) => [category.id, category]));
    return values.categoryIds.map((id) => byId.get(id)?.name ?? id);
  }, [categories, values.categoryIds]);
  const onCategories = useCallback(
    (ids: string[]) => onEdit(row, "categoryIds", ids),
    [onEdit, row]
  );
  const onKeywords = useCallback(
    (keywords: string[]) => onEdit(row, "keywords", keywords),
    [onEdit, row]
  );
  const openDialog = useCallback(() => setOpen(true), []);
  const title =
    field === "categoryIds"
      ? t("admin.gestures.table.editCategories", { name: row.name })
      : t("admin.gestures.table.editKeywords", { name: row.name });
  const summary = list(field === "categoryIds" ? names : values.keywords);
  return (
    <CellShell state={state}>
      <button
        aria-describedby={state.describedBy}
        aria-label={title}
        className={cn(
          "flex min-h-touch w-full min-w-[10rem] max-w-[16rem] items-center gap-2 rounded-md border border-border bg-surface px-3 text-left text-body-sm hover:border-foreground-muted",
          "outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          state.invalid && "border-danger",
          changedControl
        )}
        data-changed={state.changed || undefined}
        onClick={openDialog}
        type="button"
      >
        <span className="min-w-0 flex-1 truncate">
          {summary || (
            <span className="text-foreground-muted">
              {t("admin.gestures.changes.empty")}
            </span>
          )}
        </span>
        <Pencil
          aria-hidden="true"
          className="size-4 shrink-0 text-foreground-muted"
        />
      </button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent title={title}>
          {field === "categoryIds" ? (
            <CategoryPicker
              categories={picker}
              error={state.error}
              label={t("admin.gestures.fields.categoryIds")}
              onChange={onCategories}
              value={values.categoryIds}
            />
          ) : (
            <>
              <KeywordInput
                label={t("admin.gestures.fields.keywords")}
                onChange={onKeywords}
                value={values.keywords}
              />
              {state.error ? (
                <p className="text-body-sm text-danger-strong" role="alert">
                  {state.error}
                </p>
              ) : null}
            </>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button>{t("common.done")}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CellShell>
  );
}

export interface GestureTableEditorProps {
  /** Every category (`useAdminCategories`), for the picker and the diff. */
  categories: readonly AdminCategory[];
  /** The buffer, owned by the list page (it outlives filters and remounts). */
  edits: TableEdits;
  onEditsChange: (edits: TableEdits) => void;
  /** Refetches the page's rows (after a stale save, for the merge). */
  onRefresh: () => Promise<readonly AdminGestureRow[]>;
  /** Leaves the editor (after a confirmation when edits are buffered). */
  onStop: () => void;
  /** The page's rows as last read; buffered rows keep their own base. */
  rows: readonly AdminGestureRow[];
}

function rowId(row: AdminGestureRow): string {
  return row.id;
}

function useFocus(ref: RefObject<HTMLElement | null>): () => void {
  // After the action's dialog has closed and returned its focus.
  return useCallback(() => {
    setTimeout(() => ref.current?.focus(), 0);
  }, [ref]);
}

/**
 * "Edit table" (A-20): the page's gestures with editable cells. Edits are
 * buffered ("Discard (N)", "Save changes"); the confirmation lists old and
 * new per field, then one `saveMany` saves them all or nothing. A stale
 * save is merged with the newer rows (C1, as the gesture editor): their
 * other fields stay, mine are rebased; a field both changed is a conflict
 * with "Use their version" or "Overwrite with mine" (asked twice). Focus
 * returns to the editor's heading after every action.
 */
export function GestureTableEditor({
  categories,
  edits,
  onEditsChange,
  onRefresh,
  onStop,
  rows,
}: GestureTableEditorProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const list = useListFormat();
  const { saveMany } = useAdminGestureMutations();
  const [reviewing, setReviewing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [overwriting, setOverwriting] = useState(false);
  const [conflicts, setConflicts] = useState<TableConflicts>(() => new Map());
  const heading = useRef<HTMLHeadingElement>(null);
  const focusHeading = useFocus(heading);
  // Edits arrive faster than renders: always apply to the latest buffer.
  const latest = useRef(edits);
  latest.current = edits;

  const onEdit = useCallback<OnEdit>(
    (row, field, value) => {
      latest.current = setEdit(latest.current, row, field, value);
      onEditsChange(latest.current);
    },
    [onEditsChange]
  );
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );
  const changes = useMemo(
    () => changesOf(edits, categoryNames, list),
    [categoryNames, edits, list]
  );
  const invalid = [...edits.values()].some(
    (edit) => invalidFields(edit).size > 0
  );
  const tooMany = edits.size > SAVE_MANY_MAX;
  let toolbarHint = t("admin.gestures.table.hint");
  if (invalid) {
    toolbarHint = t("admin.gestures.table.invalid");
  } else if (tooMany) {
    toolbarHint = t("admin.gestures.table.tooMany", { max: SAVE_MANY_MAX });
  }

  const discardAll = useCallback(() => {
    onEditsChange(new Map());
    setConflicts(new Map());
    setDiscarding(false);
    focusHeading();
  }, [focusHeading, onEditsChange]);
  const discard = useCallback(() => {
    if (edits.size > 1) {
      setDiscarding(true);
    } else {
      discardAll();
    }
  }, [discardAll, edits.size]);

  const merge = useCallback(
    async (current: TableEdits, staleIds: readonly string[]) => {
      const fresh = await onRefresh();
      const rebased = rebaseEdits(
        current,
        new Map(fresh.map((row) => [row.id, row])),
        staleIds
      );
      onEditsChange(rebased.edits);
      setConflicts(rebased.conflicts);
      if (rebased.conflicts.size === 0) {
        toast({ title: t("admin.gestures.table.merged"), variant: "warning" });
        focusHeading();
      }
    },
    [focusHeading, onEditsChange, onRefresh, t, toast]
  );
  const save = useCallback(
    (current: TableEdits) => {
      const count = current.size;
      saveMany
        .mutateAsync({ items: saveManyItems(current) })
        .then(() => {
          onEditsChange(new Map());
          setConflicts(new Map());
          setReviewing(false);
          toast({
            title: t("admin.gestures.table.saved", { count }),
            variant: "success",
          });
          focusHeading();
        })
        .catch(async (error: unknown) => {
          console.error("[admin] Failed to save the table edits:", error);
          setReviewing(false);
          const staleIds = staleIdsOf(error);
          if (staleIds) {
            await merge(current, staleIds);
            return;
          }
          toast({
            title: t("admin.gestures.errors.saveFailed"),
            variant: "danger",
          });
        })
        .catch((error: unknown) => {
          console.error("[admin] Failed to merge the newer rows:", error);
          toast({
            title: t("admin.gestures.errors.saveFailed"),
            variant: "danger",
          });
        });
    },
    [focusHeading, merge, onEditsChange, saveMany, t, toast]
  );
  const review = useCallback(() => setReviewing(true), []);
  const confirmSave = useCallback(() => save(edits), [edits, save]);
  const takeTheirs = useCallback(() => {
    onEditsChange(resolveConflicts(edits, conflicts));
    setConflicts(new Map());
    focusHeading();
  }, [conflicts, edits, focusHeading, onEditsChange]);
  const askOverwrite = useCallback(() => setOverwriting(true), []);
  const overwrite = useCallback(() => {
    setOverwriting(false);
    setConflicts(new Map());
    save(edits);
  }, [edits, save]);
  const stop = useCallback(() => {
    if (edits.size > 0) {
      setStopping(true);
    } else {
      onStop();
    }
  }, [edits.size, onStop]);
  const confirmStop = useCallback(() => {
    onEditsChange(new Map());
    onStop();
  }, [onEditsChange, onStop]);

  // A buffered row shows its own base (its edits are against it).
  const shown = useMemo(
    () => rows.map((row) => edits.get(row.id)?.base ?? row),
    [edits, rows]
  );
  const overwriteItems = list(
    [...conflicts.entries()].map(([id, fields]) =>
      t("admin.gestures.table.overwriteItem", {
        fields: list(fields.map((field) => t(FIELD_NAME_KEYS[field]))),
        name: edits.get(id)?.base.name ?? id,
      })
    )
  );
  const columns = useMemo<DataTableColumn<AdminGestureRow>[]>(
    () => [
      {
        cell: (row) => (
          <div className="flex flex-col gap-1">
            <TextCell edits={edits} field="name" onEdit={onEdit} row={row} />
            {conflicts.has(row.id) ? (
              <Badge icon={<TriangleAlert />} variant="warning">
                {t("admin.gestures.table.staleRow")}
              </Badge>
            ) : null}
          </div>
        ),
        header: t("admin.gestures.fields.name"),
        id: "name",
      },
      {
        cell: (row) => (
          <TextCell
            edits={edits}
            field="description"
            onEdit={onEdit}
            row={row}
          />
        ),
        header: t("admin.gestures.fields.description"),
        id: "description",
      },
      {
        cell: (row) => (
          <TextCell
            edits={edits}
            field="playbackId"
            onEdit={onEdit}
            row={row}
          />
        ),
        header: t("admin.gestures.fields.playbackId"),
        id: "playbackId",
      },
      {
        cell: (row) => (
          <ListCell
            categories={categories}
            edits={edits}
            field="categoryIds"
            onEdit={onEdit}
            row={row}
          />
        ),
        header: t("admin.gestures.fields.categoryIds"),
        id: "categoryIds",
      },
      {
        cell: (row) => (
          <ListCell
            categories={categories}
            edits={edits}
            field="keywords"
            onEdit={onEdit}
            row={row}
          />
        ),
        header: t("admin.gestures.fields.keywords"),
        id: "keywords",
      },
    ],
    [categories, conflicts, edits, onEdit, t]
  );
  const rowProps = useCallback(
    (row: AdminGestureRow) =>
      conflicts.has(row.id)
        ? { className: "bg-warning-subtle", "data-stale": "true" }
        : { "data-edited": edits.has(row.id) ? "true" : undefined },
    [conflicts, edits]
  );

  return (
    <section
      aria-labelledby="table-editor-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-raised p-2">
        <div className="flex min-w-0 flex-col px-2">
          <h2
            className="font-semibold text-body-sm text-foreground outline-none focus-visible:underline"
            id="table-editor-heading"
            ref={heading}
            tabIndex={-1}
          >
            {t("admin.gestures.table.label")}
          </h2>
          <Text size="body-sm" tone="muted">
            {toolbarHint}
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          {edits.size > 0 ? (
            <Button icon={<Undo2 />} onClick={discard} variant="ghost">
              {t("admin.gestures.table.discard", { count: edits.size })}
            </Button>
          ) : null}
          <Button icon={<X />} onClick={stop} variant="secondary">
            {t("admin.gestures.table.stop")}
          </Button>
          <Button
            disabled={
              edits.size === 0 || invalid || tooMany || conflicts.size > 0
            }
            icon={<Save />}
            onClick={review}
          >
            {t("admin.gestures.table.save")}
          </Button>
        </div>
      </div>
      {conflicts.size > 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warning-subtle p-3 text-warning-strong"
          role="alert"
        >
          <p className="flex items-start gap-2 text-body-sm">
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            {t("admin.gestures.table.conflict", { count: conflicts.size })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={askOverwrite} variant="danger">
              {t("admin.gestures.conflict.overwrite")}
            </Button>
            <Button onClick={takeTheirs} variant="secondary">
              {t("admin.gestures.conflict.useTheirs")}
            </Button>
          </div>
        </div>
      ) : null}
      <DataTable
        aria-label={t("admin.gestures.table.label")}
        columns={columns}
        empty={t("admin.gestures.empty.title")}
        getRowId={rowId}
        rowProps={rowProps}
        rows={shown}
        stickyHeader
      />
      <ChangesDialog
        changes={changes}
        onConfirm={confirmSave}
        onOpenChange={setReviewing}
        open={reviewing}
        saving={saveMany.isPending}
      />
      <AlertDialog
        confirmLabel={t("admin.gestures.table.stopConfirm")}
        description={t("admin.gestures.table.stopConfirmDescription", {
          count: edits.size,
        })}
        onConfirm={confirmStop}
        onOpenChange={setStopping}
        open={stopping}
        title={t("admin.gestures.table.stopConfirmTitle")}
        tone="danger"
      />
      <AlertDialog
        confirmLabel={t("admin.gestures.table.stopConfirm")}
        description={t("admin.gestures.table.discardDescription")}
        onConfirm={discardAll}
        onOpenChange={setDiscarding}
        open={discarding}
        title={t("admin.gestures.table.discardTitle", { count: edits.size })}
        tone="danger"
      />
      <AlertDialog
        confirmLabel={t("admin.gestures.conflict.overwriteConfirm")}
        description={t("admin.gestures.table.overwriteDescription", {
          items: overwriteItems,
        })}
        onConfirm={overwrite}
        onOpenChange={setOverwriting}
        open={overwriting}
        title={t("admin.gestures.conflict.overwriteTitle")}
        tone="danger"
      />
    </section>
  );
}
