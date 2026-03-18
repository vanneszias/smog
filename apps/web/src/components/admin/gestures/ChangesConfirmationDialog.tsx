/**
 * @fileoverview Bulk-save confirmation dialog for the gesture admin table.
 *
 * Shows a summary of all pending changes (before/after for each field)
 * and asks the admin to confirm before persisting to the API.
 *
 * @example
 * <ChangesConfirmationDialog
 *   isOpen={showConfirmation}
 *   changes={getChangesForConfirmation()}
 *   isSubmitting={mutation.isPending}
 *   onClose={() => setShowConfirmation(false)}
 *   onConfirm={handleSaveChanges}
 * />
 */

import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GestureChange } from "./types";

interface ChangesConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  changes: GestureChange[];
  isSubmitting: boolean;
}

/**
 * Review-and-confirm dialog for bulk gesture edits.
 * Displays old → new values for every changed field on every changed gesture.
 */
export function ChangesConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  changes,
  isSubmitting,
}: ChangesConfirmationDialogProps) {
  return (
    <Dialog onOpenChange={onClose} open={isOpen}>
      <DialogContent className="flex max-h-[80vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5 text-[var(--admin-accent)]" />
            Confirm Changes
          </DialogTitle>
          <DialogDescription>
            Review all the changes before saving. {changes.length} gesture
            {changes.length !== 1 ? "s" : ""} will be updated.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto py-4">
          {changes.map(({ gesture, changes: gestureChanges }) => (
            <div
              className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-bg)] p-4"
              key={gesture._id}
            >
              <h4 className="mb-2 font-semibold text-[var(--admin-text)]">
                {gesture.name}
              </h4>
              <div className="space-y-2">
                {Object.entries(gestureChanges).map(
                  ([field, { old, new: newValue }]) => (
                    <div className="text-sm" key={field}>
                      <span className="font-medium text-[var(--admin-text-muted)] capitalize">
                        {field}:
                      </span>
                      <div className="mt-1 ml-4 space-y-1">
                        <div className="flex items-start gap-2">
                          <span className="text-[var(--admin-text-muted)]">
                            →
                          </span>
                          <span className="text-[var(--admin-error)] line-through">
                            {Array.isArray(old)
                              ? old.join(", ") || "(empty)"
                              : String(old) || "(empty)"}
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-[var(--admin-accent)]">→</span>
                          <span className="font-medium text-[var(--admin-success)]">
                            {Array.isArray(newValue)
                              ? newValue.join(", ") || "(empty)"
                              : String(newValue) || "(empty)"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="border-[var(--admin-border)] border-t pt-4">
          <Button disabled={isSubmitting} onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button className="gap-2" disabled={isSubmitting} onClick={onConfirm}>
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save All Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
