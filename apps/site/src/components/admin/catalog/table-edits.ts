import {
  type AdminGestureRow,
  gestureCategoryIdsSchema,
  gestureDescriptionSchema,
  gestureKeywordsSchema,
  gestureNameSchema,
  playbackIdSchema,
  type SaveManyInput,
} from "@smog/admin/schema";

/**
 * The table editor's buffer (A-20): per gesture, the row as it was first
 * read and the fields changed since. The base never moves while edits are
 * buffered, so its `updatedAt` is what `saveMany` checks: a row another
 * admin saved in the meantime comes back `CONFLICT` `stale`.
 */

/** The cells the table editor edits, in column order. */
const TABLE_FIELDS = [
  "name",
  "description",
  "playbackId",
  "categoryIds",
  "keywords",
] as const;
export type TableField = (typeof TABLE_FIELDS)[number];

export interface TableValues {
  categoryIds: string[];
  description: string;
  keywords: string[];
  name: string;
  playbackId: string;
}

export interface RowEdit {
  /** The row as read when its first cell was edited. */
  base: AdminGestureRow;
  patch: Partial<TableValues>;
}

/** Gesture id → its buffered edit (only rows with a change). */
export type TableEdits = ReadonlyMap<string, RowEdit>;

function valuesOf(row: AdminGestureRow): TableValues {
  return {
    categoryIds: row.categories.map((category) => category.id),
    description: row.description,
    keywords: row.keywords,
    name: row.name,
    playbackId: row.playbackId,
  };
}

function same<F extends TableField>(
  field: F,
  a: TableValues[F],
  b: TableValues[F]
): boolean {
  if (field === "categoryIds") {
    const left = new Set(a as string[]);
    const right = b as string[];
    return (
      left.size === new Set(right).size && right.every((id) => left.has(id))
    );
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length && a.every((value, index) => value === b[index])
    );
  }
  return String(a).trim() === String(b).trim();
}

/**
 * Sets one cell. A value equal to the base (after trimming, categories as
 * a set) forgets the field; a row left without changes leaves the buffer.
 */
export function setEdit<F extends TableField>(
  edits: TableEdits,
  row: AdminGestureRow,
  field: F,
  value: TableValues[F]
): TableEdits {
  const current = edits.get(row.id);
  const base = current?.base ?? row;
  const patch: Partial<TableValues> = { ...current?.patch };
  if (same(field, valuesOf(base)[field], value)) {
    delete patch[field];
  } else {
    patch[field] = value;
  }
  const next = new Map(edits);
  if (Object.keys(patch).length === 0) {
    next.delete(row.id);
  } else {
    next.set(row.id, { base, patch });
  }
  return next;
}

/** The row's values with its buffered edits applied. */
export function editedValues(
  edits: TableEdits,
  row: AdminGestureRow
): TableValues {
  const edit = edits.get(row.id);
  return { ...valuesOf(edit?.base ?? row), ...edit?.patch };
}

const FIELD_SCHEMAS = {
  categoryIds: gestureCategoryIdsSchema,
  description: gestureDescriptionSchema,
  keywords: gestureKeywordsSchema,
  name: gestureNameSchema,
  playbackId: playbackIdSchema,
} as const;

/** The edited cells the contract would refuse (marked; Save waits for them). */
export function invalidFields(edit: RowEdit | undefined): Set<TableField> {
  const invalid = new Set<TableField>();
  if (!edit) {
    return invalid;
  }
  for (const field of TABLE_FIELDS) {
    const value = edit.patch[field];
    if (value !== undefined && !FIELD_SCHEMAS[field].safeParse(value).success) {
      invalid.add(field);
    }
  }
  return invalid;
}

/** The one `saveMany` call: every buffered row with its base `updatedAt`. */
export function saveManyItems(edits: TableEdits): SaveManyInput["items"] {
  return [...edits.entries()].map(([id, edit]) => ({
    expectedUpdatedAt: edit.base.updatedAt,
    id,
    patch: {
      ...Object.fromEntries(
        TABLE_FIELDS.flatMap((field) =>
          edit.patch[field] === undefined ? [] : [[field, edit.patch[field]]]
        )
      ),
      // A typed playback id is not the old Mux asset any more (I4).
      ...(edit.patch.playbackId === undefined ? {} : { muxAssetId: null }),
    },
  }));
}

/** Gesture id → the fields both this admin and another one changed. */
export type TableConflicts = ReadonlyMap<string, readonly TableField[]>;

/**
 * After a stale `saveMany` (C1): each stale row is rebased on their newer
 * version. A field only I changed stays in the buffer, a field only they
 * changed is theirs (it was never in the patch), an edit equal to theirs
 * leaves; a field we both changed differently stays buffered as a
 * conflict until the admin chooses (`resolveConflicts` or a save).
 */
export function rebaseEdits(
  edits: TableEdits,
  fresh: ReadonlyMap<string, AdminGestureRow>,
  staleIds: readonly string[]
): { conflicts: TableConflicts; edits: TableEdits } {
  const next = new Map(edits);
  const conflicts = new Map<string, TableField[]>();
  for (const id of staleIds) {
    const edit = edits.get(id);
    const theirs = fresh.get(id);
    if (!(edit && theirs)) {
      continue;
    }
    const base = valuesOf(edit.base);
    const now = valuesOf(theirs);
    const patch: Partial<TableValues> = {};
    const clashing: TableField[] = [];
    for (const field of TABLE_FIELDS) {
      const mine = edit.patch[field];
      if (mine === undefined || same(field, now[field], mine as never)) {
        continue;
      }
      Object.assign(patch, { [field]: mine });
      if (!same(field, base[field], now[field])) {
        clashing.push(field);
      }
    }
    if (Object.keys(patch).length === 0) {
      next.delete(id);
    } else {
      next.set(id, { base: theirs, patch });
    }
    if (clashing.length > 0) {
      conflicts.set(id, clashing);
    }
  }
  return { conflicts, edits: next };
}

/** "Use their version": drops the conflicting fields from the buffer. */
export function resolveConflicts(
  edits: TableEdits,
  conflicts: TableConflicts
): TableEdits {
  const next = new Map(edits);
  for (const [id, fields] of conflicts) {
    const edit = next.get(id);
    if (!edit) {
      continue;
    }
    const patch: Partial<TableValues> = { ...edit.patch };
    for (const field of fields) {
      delete patch[field];
    }
    if (Object.keys(patch).length === 0) {
      next.delete(id);
    } else {
      next.set(id, { base: edit.base, patch });
    }
  }
  return next;
}

interface FieldChange {
  after: string;
  before: string;
  field: TableField;
}

export interface RowChanges {
  fields: FieldChange[];
  id: string;
  /** The name as it was read (the row's label in the dialog). */
  name: string;
}

/** Formats a list for people ("a, b and c"); `useListFormat` in the UI. */
export type ListFormat = (items: readonly string[]) => string;

function display(
  field: TableField,
  value: TableValues[TableField],
  categoryNames: ReadonlyMap<string, string>,
  list: ListFormat
): string {
  if (field === "categoryIds") {
    return list((value as string[]).map((id) => categoryNames.get(id) ?? id));
  }
  return Array.isArray(value) ? list(value) : value.trim();
}

/** Old and new per changed field, for the confirm dialog. */
export function changesOf(
  edits: TableEdits,
  categoryNames: ReadonlyMap<string, string>,
  list: ListFormat
): RowChanges[] {
  return [...edits.entries()].map(([id, edit]) => {
    const before = valuesOf(edit.base);
    return {
      fields: TABLE_FIELDS.flatMap((field) => {
        const after = edit.patch[field];
        return after === undefined
          ? []
          : [
              {
                after: display(field, after, categoryNames, list),
                before: display(field, before[field], categoryNames, list),
                field,
              },
            ];
      }),
      id,
      name: edit.base.name,
    };
  });
}
