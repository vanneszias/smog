import { useAdminGestureMutations } from "@smog/admin/client";
import {
  type AdminCategory,
  type AdminGestureRow,
  SAVE_MANY_MAX,
} from "@smog/admin/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  AlertDialog,
  Badge,
  Button,
  DataTable,
  type DataTableColumn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  Input,
  Text,
  useToast,
} from "@smog/ui-web";
import { Pencil, RotateCcw, Save, TriangleAlert, Undo2, X } from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";
import { CategoryPicker, pickerCategories } from "./category-picker";
import { ChangesDialog } from "./changes-dialog";
import { conflictReason } from "./errors";
import { KeywordInput } from "./keyword-input";
import {
  changesOf,
  dropEdits,
  editedValues,
  invalidFields,
  saveManyItems,
  setEdit,
  type TableEdits,
  type TableField,
  type TableValues,
} from "./table-edits";

type OnEdit = <F extends TableField>(
  row: AdminGestureRow,
  field: F,
  value: TableValues[F]
) => void;

const TEXT_FIELD_KEYS = {
  description: "admin.gestures.fields.description",
  name: "admin.gestures.fields.name",
  playbackId: "admin.gestures.fields.playbackId",
} as const;
type TextField = keyof typeof TEXT_FIELD_KEYS;

function TextCell({
  edits,
  field,
  onEdit,
  row,
}: {
  edits: TableEdits;
  field: TextField;
  onEdit: OnEdit;
  row: AdminGestureRow;
}): ReactNode {
  const { t } = useTranslation();
  const value = editedValues(edits, row)[field];
  const invalid = invalidFields(edits.get(row.id)).has(field);
  const changed = edits.get(row.id)?.patch[field] !== undefined;
  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onEdit(row, field, event.target.value),
    [field, onEdit, row]
  );
  return (
    <Input
      aria-label={t("admin.gestures.table.cell", {
        field: t(TEXT_FIELD_KEYS[field]),
        name: row.name,
      })}
      autoComplete="off"
      className={field === "description" ? "min-w-[16rem]" : "min-w-[10rem]"}
      data-changed={changed || undefined}
      invalid={invalid}
      onChange={onChange}
      spellCheck={field !== "playbackId"}
      value={value}
    />
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
  const [open, setOpen] = useState(false);
  const values = editedValues(edits, row);
  const invalid = invalidFields(edits.get(row.id)).has(field);
  const changed = edits.get(row.id)?.patch[field] !== undefined;
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
  const summary =
    field === "categoryIds" ? names.join(", ") : values.keywords.join(", ");
  return (
    <>
      <button
        aria-invalid={invalid || undefined}
        aria-label={title}
        className="flex min-h-touch w-full min-w-[10rem] max-w-[16rem] items-center gap-2 rounded-md border border-border bg-surface px-3 text-left text-body-sm outline-none hover:border-foreground-muted focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-danger"
        data-changed={changed || undefined}
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
              error={
                invalid
                  ? t("admin.gestures.editor.categoriesRequired")
                  : undefined
              }
              label={t("admin.gestures.fields.categoryIds")}
              onChange={onCategories}
              value={values.categoryIds}
            />
          ) : (
            <KeywordInput
              label={t("admin.gestures.fields.keywords")}
              onChange={onKeywords}
              value={values.keywords}
            />
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button>{t("common.done")}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export interface GestureTableEditorProps {
  /** Every category (`useAdminCategories`), for the picker and the diff. */
  categories: readonly AdminCategory[];
  /** Leaves the editor (after a confirmation when edits are buffered). */
  onStop: () => void;
  /** The page's rows as last read; buffered rows keep their first read. */
  rows: readonly AdminGestureRow[];
}

function rowId(row: AdminGestureRow): string {
  return row.id;
}

/**
 * "Edit table" (A-20): the page's gestures with editable cells. Edits are
 * buffered ("Discard (N)", "Save changes"); the confirmation lists old and
 * new per field, then one `saveMany` saves them all or nothing. A stale
 * row (`CONFLICT` `stale`) is highlighted with "Reload these rows"; the
 * other edits stay buffered.
 */
export function GestureTableEditor({
  categories,
  onStop,
  rows,
}: GestureTableEditorProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { clearStale, saveMany, staleIds } = useAdminGestureMutations();
  const [edits, setEdits] = useState<TableEdits>(() => new Map());
  const [reviewing, setReviewing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const stale = useMemo(() => new Set(staleIds ?? []), [staleIds]);

  const onEdit = useCallback<OnEdit>((row, field, value) => {
    setEdits((previous) => setEdit(previous, row, field, value));
  }, []);
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );
  const changes = useMemo(
    () => changesOf(edits, categoryNames),
    [categoryNames, edits]
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

  const discard = useCallback(() => {
    setEdits(new Map());
    clearStale();
  }, [clearStale]);
  const reloadStale = useCallback(() => {
    setEdits((previous) => dropEdits(previous, staleIds ?? []));
    clearStale();
  }, [clearStale, staleIds]);
  const review = useCallback(() => setReviewing(true), []);
  const save = useCallback(() => {
    const count = edits.size;
    saveMany
      .mutateAsync({ items: saveManyItems(edits) })
      .then(() => {
        setEdits(new Map());
        setReviewing(false);
        toast({
          title: t("admin.gestures.table.saved", { count }),
          variant: "success",
        });
      })
      .catch((error: unknown) => {
        console.error("[admin] Failed to save the table edits:", error);
        setReviewing(false);
        // A stale save is shown on its rows; anything else is a toast.
        if (conflictReason(error) !== "stale") {
          toast({
            title: t("admin.gestures.errors.saveFailed"),
            variant: "danger",
          });
        }
      });
  }, [edits, saveMany, t, toast]);
  const stop = useCallback(() => {
    if (edits.size > 0) {
      setStopping(true);
    } else {
      onStop();
    }
  }, [edits.size, onStop]);
  const confirmStop = useCallback(() => {
    clearStale();
    onStop();
  }, [clearStale, onStop]);

  // A buffered row shows its first read (its edits are against it).
  const shown = useMemo(
    () => rows.map((row) => edits.get(row.id)?.base ?? row),
    [edits, rows]
  );
  const columns = useMemo<DataTableColumn<AdminGestureRow>[]>(
    () => [
      {
        cell: (row) => (
          <div className="flex flex-col gap-1">
            <TextCell edits={edits} field="name" onEdit={onEdit} row={row} />
            {stale.has(row.id) ? (
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
    [categories, edits, onEdit, stale, t]
  );
  const rowProps = useCallback(
    (row: AdminGestureRow) =>
      stale.has(row.id)
        ? { className: "bg-warning-subtle", "data-stale": "true" }
        : {
            className: edits.has(row.id) ? "bg-primary-subtle/40" : undefined,
            "data-edited": edits.has(row.id) ? "true" : undefined,
          },
    [edits, stale]
  );

  return (
    <section
      aria-label={t("admin.gestures.table.label")}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-raised p-2">
        <Text className="px-2" size="body-sm" tone="muted">
          {toolbarHint}
        </Text>
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
            disabled={edits.size === 0 || invalid || tooMany}
            icon={<Save />}
            onClick={review}
          >
            {t("admin.gestures.table.save")}
          </Button>
        </div>
      </div>
      {stale.size > 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warning-subtle p-3 text-warning-strong"
          role="alert"
        >
          <p className="flex items-start gap-2 text-body-sm">
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            {t("admin.gestures.table.stale", { count: stale.size })}
          </p>
          <Button
            icon={<RotateCcw />}
            onClick={reloadStale}
            variant="secondary"
          >
            {t("admin.gestures.table.reloadRows")}
          </Button>
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
        onConfirm={save}
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
    </section>
  );
}
