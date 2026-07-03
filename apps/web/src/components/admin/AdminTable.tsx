/**
 * @fileoverview Admin gesture management table.
 *
 * An inline-editable data table for managing all gestures in the admin portal.
 * Supports:
 * - Inline editing of name, description, playback ID, concepts, and categories
 * - Active/inactive toggle per gesture
 * - Search by name, description, or concept
 * - Filter to show only inactive gestures
 * - Bulk save with before/after confirmation dialog
 * - Creating new gestures via the `CreateGestureDialog`
 *
 * Architecture — this component owns only layout and API wiring:
 * - `gestures/useGestureTableEditing` — pending-changes state machine
 * - `gestures/EditableCell` — inline input/textarea
 * - `gestures/ConceptsCell` — inline concept tag editor
 * - `gestures/CategoriesCell` — inline category multi-select
 * - `gestures/ChangesConfirmationDialog` — review-and-confirm modal
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@smog/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  Filter,
  Save,
  Search,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { client, orpc } from "@/utils/orpc";
import { CreateGestureDialog } from "./CreateGestureDialog";
import { CategoriesCell } from "./gestures/CategoriesCell";
import { ChangesConfirmationDialog } from "./gestures/ChangesConfirmationDialog";
import { ConceptsCell } from "./gestures/ConceptsCell";
import { EditableCell } from "./gestures/EditableCell";
import type { AdminGesture } from "./gestures/types";
import { useGestureTableEditing } from "./gestures/useGestureTableEditing";
import { useAdminFilters } from "./hooks/useAdminFilters";

/**
 * Inline-editable gesture admin table.
 *
 * All changes are buffered locally via `useGestureTableEditing` until the
 * admin explicitly saves. The confirmation dialog shows a diff before committing.
 */
export function AdminTable() {
  const queryClient = useQueryClient();
  const { searchQuery, setSearchQuery } = useAdminFilters();
  const [localShowInactiveOnly, setLocalShowInactiveOnly] = useState(false);

  const { data: gestures, isLoading } = useQuery(
    orpc.admin.gestures.listAll.queryOptions({
      input: {
        includeInactive: true,
        limit: 500,
      },
    })
  );

  const { data: categories } = useQuery(orpc.categories.list.queryOptions());

  const bulkUpdateMutation = useMutation({
    mutationFn: async (
      changes: {
        gestureId: string;
        updates: Partial<AdminGesture>;
      }[]
    ) => {
      const results: { success: boolean }[] = [];
      for (const change of changes) {
        results.push(
          await client.admin.gestures.update({
            gestureId: change.gestureId,
            ...change.updates,
          })
        );
      }
      return results;
    },
    onSuccess: () => {
      toast.success("All changes saved successfully");
      editing.clearAfterSave();
      queryClient.invalidateQueries({
        queryKey: orpc.admin.gestures.listAll.queryOptions({
          input: {
            includeInactive: true,
            limit: 500,
          },
        }).queryKey,
      });
    },
    onError: (error) => {
      toast.error(`Failed to save changes: ${error.message}`);
    },
  });

  const editing = useGestureTableEditing({
    gestures,
    onSave: (changes) => bulkUpdateMutation.mutate(changes),
  });

  // ─── Filter logic ─────────────────────────────────────────────────────────

  const filteredGestures = useMemo(() => {
    if (!gestures) {
      return [];
    }
    let filtered = gestures;
    if (localShowInactiveOnly) {
      filtered = filtered.filter((g) => !g.isActive);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.info.toLowerCase().includes(q) ||
          g.concept.some((c) => c.toLowerCase().includes(q))
      );
    }
    return filtered;
  }, [gestures, searchQuery, localShowInactiveOnly]);

  const stats = useMemo(() => {
    if (!gestures) {
      return { total: 0, active: 0, inactive: 0 };
    }
    const total = gestures.length;
    const active = gestures.filter((g) => g.isActive).length;
    return { total, active, inactive: total - active };
  }, [gestures]);

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--admin-accent)] border-t-transparent" />
          <p className="text-[var(--admin-text-muted)] text-sm">
            Loading gestures...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--admin-accent)]/10">
              <Sparkles className="h-5 w-5 text-[var(--admin-accent)]" />
            </div>
            <div>
              <p className="font-semibold text-[var(--admin-text)] text-lg">
                {stats.total}
              </p>
              <p className="text-[var(--admin-text-muted)] text-xs">
                Total Gestures
              </p>
            </div>
          </div>
          <div className="h-8 w-px bg-[var(--admin-border)]" />
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-[var(--admin-text-secondary)]">
              <Eye className="h-4 w-4 text-[var(--admin-success)]" />
              {stats.active} Active
            </span>
            <span className="flex items-center gap-1.5 text-[var(--admin-text-secondary)]">
              <EyeOff className="h-4 w-4 text-[var(--admin-text-muted)]" />
              {stats.inactive} Hidden
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {editing.hasChanges && (
            <>
              <Button
                className="gap-2"
                onClick={() => {
                  editing.discardChanges();
                  toast.info("Changes discarded");
                }}
                size="sm"
                variant="outline"
              >
                <X className="h-4 w-4" />
                Discard ({editing.pendingCount})
              </Button>
              <Button
                className="gap-2"
                onClick={() => editing.setShowConfirmation(true)}
                size="sm"
              >
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </>
          )}
          <CreateGestureDialog />
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--admin-text-muted)]" />
          <Input
            className="h-10 bg-[var(--admin-bg)] pl-10"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search gestures by name, description, or concept..."
            value={searchQuery}
          />
        </div>
        <Button
          className={`h-10 gap-2 ${localShowInactiveOnly ? "bg-[var(--admin-accent)] text-white hover:bg-[var(--admin-accent-dark)]" : ""}`}
          onClick={() => setLocalShowInactiveOnly(!localShowInactiveOnly)}
          size="sm"
          variant={localShowInactiveOnly ? "default" : "outline"}
        >
          <Filter className="h-4 w-4" />
          {localShowInactiveOnly ? "Showing Hidden" : "Show Hidden"}
          {stats.inactive > 0 && (
            <Badge
              className="ml-1"
              variant={localShowInactiveOnly ? "secondary" : "outline"}
            >
              {stats.inactive}
            </Badge>
          )}
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--admin-border)] bg-white">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[var(--admin-bg)] hover:bg-[var(--admin-bg)]">
                <TableHead className="w-[50px] font-semibold text-xs uppercase tracking-wide">
                  <Eye className="h-4 w-4" />
                </TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">
                  Name
                </TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">
                  <Tag className="mr-1 inline h-4 w-4" />
                  Categories
                </TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">
                  <Sparkles className="mr-1 inline h-4 w-4" />
                  Concepts
                </TableHead>
                <TableHead className="min-w-[200px] font-semibold text-xs uppercase tracking-wide">
                  Description
                </TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">
                  Video ID
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGestures.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="h-32 text-center text-[var(--admin-text-muted)]"
                    colSpan={6}
                  >
                    No gestures found
                  </TableCell>
                </TableRow>
              ) : (
                filteredGestures.map((gesture) => {
                  const display = editing.getGestureWithChanges(gesture);
                  const isPending = !!editing.pendingChanges[gesture._id];

                  return (
                    <TableRow
                      className={`group ${isPending ? "bg-[var(--admin-accent)]/5" : ""} ${display.isActive ? "" : "opacity-60"}`}
                      key={gesture._id}
                    >
                      {/* Active toggle */}
                      <TableCell>
                        <Switch
                          checked={display.isActive}
                          className="scale-75"
                          onCheckedChange={(checked) =>
                            editing.updateField(
                              gesture._id,
                              "isActive",
                              checked
                            )
                          }
                        />
                      </TableCell>

                      {/* Name */}
                      <TableCell className="font-medium">
                        {editing.editingCell?.gestureId === gesture._id &&
                        editing.editingCell.field === "name" ? (
                          <EditableCell
                            onBlur={() => editing.setEditingCell(null)}
                            onChange={(v) =>
                              editing.updateField(gesture._id, "name", v)
                            }
                            value={display.name}
                          />
                        ) : (
                          <button
                            className="text-left hover:text-[var(--admin-accent)]"
                            onClick={() =>
                              editing.setEditingCell({
                                gestureId: gesture._id,
                                field: "name",
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                editing.setEditingCell({
                                  gestureId: gesture._id,
                                  field: "name",
                                });
                              }
                            }}
                            type="button"
                          >
                            {display.name}
                          </button>
                        )}
                      </TableCell>

                      {/* Categories */}
                      <TableCell>
                        <CategoriesCell
                          categories={categories ?? []}
                          categoryIds={display.categoryIds}
                          onChange={(ids) =>
                            editing.updateField(gesture._id, "categoryIds", ids)
                          }
                        />
                      </TableCell>

                      {/* Concepts */}
                      <TableCell>
                        <ConceptsCell
                          concepts={display.concept}
                          onChange={(c) =>
                            editing.updateField(gesture._id, "concept", c)
                          }
                        />
                      </TableCell>

                      {/* Description */}
                      <TableCell>
                        {editing.editingCell?.gestureId === gesture._id &&
                        editing.editingCell.field === "info" ? (
                          <EditableCell
                            multiline
                            onBlur={() => editing.setEditingCell(null)}
                            onChange={(v) =>
                              editing.updateField(gesture._id, "info", v)
                            }
                            value={display.info}
                          />
                        ) : (
                          <button
                            className="line-clamp-2 max-w-[300px] text-left text-sm hover:text-[var(--admin-accent)]"
                            onClick={() =>
                              editing.setEditingCell({
                                gestureId: gesture._id,
                                field: "info",
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                editing.setEditingCell({
                                  gestureId: gesture._id,
                                  field: "info",
                                });
                              }
                            }}
                            type="button"
                          >
                            {display.info || (
                              <span className="text-[var(--admin-text-muted)] italic">
                                Click to add description...
                              </span>
                            )}
                          </button>
                        )}
                      </TableCell>

                      {/* Playback ID */}
                      <TableCell>
                        {editing.editingCell?.gestureId === gesture._id &&
                        editing.editingCell.field === "playbackId" ? (
                          <EditableCell
                            className="font-mono text-xs"
                            onBlur={() => editing.setEditingCell(null)}
                            onChange={(v) =>
                              editing.updateField(gesture._id, "playbackId", v)
                            }
                            value={display.playbackId}
                          />
                        ) : (
                          <button
                            className="rounded bg-[var(--admin-bg)] px-2 py-1 font-mono text-xs hover:text-[var(--admin-accent)]"
                            onClick={() =>
                              editing.setEditingCell({
                                gestureId: gesture._id,
                                field: "playbackId",
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                editing.setEditingCell({
                                  gestureId: gesture._id,
                                  field: "playbackId",
                                });
                              }
                            }}
                            type="button"
                          >
                            {display.playbackId.slice(0, 12)}...
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Confirmation dialog */}
      <ChangesConfirmationDialog
        changes={editing.getChangesForConfirmation()}
        isOpen={editing.showConfirmation}
        isSubmitting={bulkUpdateMutation.isPending}
        onClose={() => editing.setShowConfirmation(false)}
        onConfirm={editing.handleSave}
      />
    </div>
  );
}
