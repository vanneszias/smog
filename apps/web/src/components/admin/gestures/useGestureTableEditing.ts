/**
 * @fileoverview Inline-editing state for the gesture admin table.
 *
 * Manages:
 * - Which cell is currently being edited
 * - Pending changes (not yet saved to the API)
 * - Change summarisation for the confirmation dialog
 * - Save / discard actions
 *
 * @example
 * const editing = useGestureTableEditing({ gestures, onSave });
 * editing.updateField(gestureId, "name", newName);
 * editing.handleSave();
 */

import { useCallback, useState } from "react";
import type { AdminGesture, GestureChange } from "./types";

interface UseGestureTableEditingOptions {
  gestures: AdminGesture[] | undefined;
  onSave: (
    changes: { gestureId: string; updates: Partial<AdminGesture> }[]
  ) => void;
}

/**
 * Manages pending inline edits for the gesture admin table.
 *
 * All changes are buffered locally. The admin must click "Save Changes" to
 * persist them to the API via `onSave`.
 */
export function useGestureTableEditing({
  gestures,
  onSave,
}: UseGestureTableEditingOptions) {
  const [editingCell, setEditingCell] = useState<{
    gestureId: string;
    field: string;
  } | null>(null);
  const [pendingChanges, setPendingChanges] = useState<
    Record<string, Partial<AdminGesture>>
  >({});
  const [showConfirmation, setShowConfirmation] = useState(false);

  /** Merge a field value change into the pending changes buffer. */
  const updateField = useCallback(
    (gestureId: string, field: keyof AdminGesture, value: unknown) => {
      setPendingChanges((prev) => ({
        ...prev,
        [gestureId]: {
          ...prev[gestureId],
          [field]: value,
        },
      }));
    },
    []
  );

  /**
   * Return the gesture merged with any pending local changes.
   * Use this when rendering table rows so edits are immediately visible.
   */
  const getGestureWithChanges = useCallback(
    (gesture: AdminGesture): AdminGesture => ({
      ...gesture,
      ...pendingChanges[gesture._id],
    }),
    [pendingChanges]
  );

  /** Build the change summary used by the confirmation dialog. */
  const getChangesForConfirmation = useCallback((): GestureChange[] => {
    return Object.entries(pendingChanges).map(([gestureId, changes]) => {
      const original = gestures?.find((g) => g._id === gestureId);
      const fieldChanges: Record<string, { old: unknown; new: unknown }> = {};

      for (const [field, newValue] of Object.entries(changes)) {
        const oldValue = original?.[field as keyof AdminGesture];
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          fieldChanges[field] = { old: oldValue, new: newValue };
        }
      }

      return {
        gesture: original!,
        changes: fieldChanges,
      };
    });
  }, [pendingChanges, gestures]);

  /** Flush pending changes to the API via `onSave`. */
  const handleSave = useCallback(() => {
    const changes = Object.entries(pendingChanges).map(
      ([gestureId, updates]) => ({
        gestureId,
        updates,
      })
    );
    onSave(changes);
  }, [pendingChanges, onSave]);

  /** Discard all pending changes. */
  const discardChanges = useCallback(() => {
    setPendingChanges({});
  }, []);

  /** Clear pending changes after a successful save. */
  const clearAfterSave = useCallback(() => {
    setPendingChanges({});
    setShowConfirmation(false);
  }, []);

  return {
    editingCell,
    setEditingCell,
    pendingChanges,
    hasChanges: Object.keys(pendingChanges).length > 0,
    pendingCount: Object.keys(pendingChanges).length,
    updateField,
    getGestureWithChanges,
    getChangesForConfirmation,
    handleSave,
    discardChanges,
    clearAfterSave,
    showConfirmation,
    setShowConfirmation,
  };
}
