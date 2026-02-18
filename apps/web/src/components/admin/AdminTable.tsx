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
  Check,
  Eye,
  EyeOff,
  Filter,
  Save,
  Search,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { client, orpc } from "@/utils/orpc";
import { CreateGestureDialog } from "./CreateGestureDialog";

interface Gesture {
  _id: string;
  name: string;
  info: string;
  playbackId: string;
  concept: string[];
  isActive: boolean;
  categoryIds: string[];
}

interface Category {
  _id: string;
  name: string;
  isActive: boolean;
}

interface EditableCellProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  multiline?: boolean;
  className?: string;
}

function EditableCell({
  value,
  onChange,
  onBlur,
  multiline = false,
  className = "",
}: EditableCellProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  if (multiline) {
    return (
      <textarea
        autoFocus
        className={`min-h-[60px] w-full resize-none rounded border border-[var(--admin-accent)] bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/20 ${className}`}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onBlur();
          }
          if (e.key === "Escape") {
            onBlur();
          }
        }}
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={value}
      />
    );
  }

  return (
    <input
      autoFocus
      className={`w-full rounded border border-[var(--admin-accent)] bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/20 ${className}`}
      onBlur={onBlur}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onBlur();
        }
        if (e.key === "Escape") {
          onBlur();
        }
      }}
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type="text"
      value={value}
    />
  );
}

interface ConceptsCellProps {
  concepts: string[];
  onChange: (concepts: string[]) => void;
}

function ConceptsCell({ concepts, onChange }: ConceptsCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newConcept, setNewConcept] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const trimmed = newConcept.trim();
    if (trimmed && !concepts.includes(trimmed)) {
      onChange([...concepts, trimmed]);
      setNewConcept("");
    }
  };

  const handleRemove = (concept: string) => {
    onChange(concepts.filter((c) => c !== concept));
  };

  if (isEditing) {
    return (
      <div className="min-w-[200px] space-y-2">
        <div className="flex flex-wrap gap-1">
          {concepts.map((concept) => (
            <button
              className="inline-flex items-center gap-1 rounded-full border-transparent bg-secondary px-2 py-0.5 font-medium text-secondary-foreground text-xs transition-colors hover:bg-secondary/80"
              key={concept}
              onClick={() => handleRemove(concept)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleRemove(concept);
                }
              }}
              type="button"
            >
              {concept}
              <span aria-hidden="true" className="text-xs">
                ×
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <Input
            autoFocus
            className="h-7 text-xs"
            onChange={(e) => setNewConcept(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
              if (e.key === "Escape") {
                setIsEditing(false);
              }
            }}
            placeholder="Add concept..."
            ref={inputRef}
            value={newConcept}
          />
        </div>
        <div className="flex gap-1">
          <Button
            className="h-6 px-2 text-xs"
            onClick={handleAdd}
            size="sm"
            variant="ghost"
          >
            <Check className="mr-1 h-3 w-3" />
            Add
          </Button>
          <Button
            className="h-6 px-2 text-xs"
            onClick={() => setIsEditing(false)}
            size="sm"
            variant="ghost"
          >
            <X className="mr-1 h-3 w-3" />
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      className="flex min-w-[120px] cursor-pointer flex-wrap gap-1 text-left hover:opacity-70"
      onClick={() => setIsEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsEditing(true);
        }
      }}
      type="button"
    >
      {concepts.length === 0 ? (
        <span className="text-[var(--admin-text-muted)] text-xs italic">
          Click to add...
        </span>
      ) : (
        concepts.map((concept) => (
          <Badge className="text-xs" key={concept} variant="outline">
            {concept}
          </Badge>
        ))
      )}
    </button>
  );
}

interface CategoriesCellProps {
  categoryIds: string[];
  categories: Category[];
  onChange: (categoryIds: string[]) => void;
}

function CategoriesCell({
  categoryIds,
  categories,
  onChange,
}: CategoriesCellProps) {
  const [isEditing, setIsEditing] = useState(false);

  const toggleCategory = (categoryId: string) => {
    if (categoryIds.includes(categoryId)) {
      onChange(categoryIds.filter((id) => id !== categoryId));
    } else {
      onChange([...categoryIds, categoryId]);
    }
  };

  const selectedCategories = categories.filter((c) =>
    categoryIds.includes(c._id)
  );

  if (isEditing) {
    return (
      <div className="min-w-[200px] space-y-2">
        <div className="flex max-h-[150px] flex-wrap gap-1 overflow-y-auto">
          {categories
            .filter((c) => c.isActive)
            .map((category) => {
              const isSelected = categoryIds.includes(category._id);
              return (
                <button
                  className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  }`}
                  key={category._id}
                  onClick={() => toggleCategory(category._id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleCategory(category._id);
                    }
                  }}
                  type="button"
                >
                  {isSelected && <Check className="mr-1 h-3 w-3" />}
                  {category.name}
                </button>
              );
            })}
        </div>
        <Button
          className="h-6 px-2 text-xs"
          onClick={() => setIsEditing(false)}
          size="sm"
          variant="ghost"
        >
          <Check className="mr-1 h-3 w-3" />
          Done
        </Button>
      </div>
    );
  }

  return (
    <button
      className="flex min-w-[120px] cursor-pointer flex-wrap gap-1 text-left hover:opacity-70"
      onClick={() => setIsEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsEditing(true);
        }
      }}
      type="button"
    >
      {selectedCategories.length === 0 ? (
        <span className="text-[var(--admin-text-muted)] text-xs italic">
          Click to select...
        </span>
      ) : (
        selectedCategories.map((cat) => (
          <Badge className="text-xs" key={cat._id} variant="secondary">
            {cat.name}
          </Badge>
        ))
      )}
    </button>
  );
}

interface ChangesConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  changes: GestureChange[];
  isSubmitting: boolean;
}

interface GestureChange {
  gesture: Gesture;
  changes: Record<string, { old: unknown; new: unknown }>;
}

function ChangesConfirmationDialog({
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

export function AdminTable() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactiveOnly, setShowInactiveOnly] = useState(false);
  const [editingCell, setEditingCell] = useState<{
    gestureId: string;
    field: string;
  } | null>(null);
  const [pendingChanges, setPendingChanges] = useState<
    Record<string, Partial<Gesture>>
  >({});
  const [showConfirmation, setShowConfirmation] = useState(false);

  const { data: gestures, isLoading } = useQuery(
    orpc.admin.gestures.listAll.queryOptions({
      includeInactive: true,
      limit: 500,
    })
  );

  const { data: categories } = useQuery(orpc.categories.list.queryOptions());

  const bulkUpdateMutation = useMutation({
    mutationFn: async (
      changes: { gestureId: string; updates: Partial<Gesture> }[]
    ) => {
      const results: { success: boolean }[] = [];
      for (const change of changes) {
        results.push(await client.admin.gestures.update(change));
      }
      return results;
    },
    onSuccess: () => {
      toast.success("All changes saved successfully");
      setPendingChanges({});
      setShowConfirmation(false);
      queryClient.invalidateQueries({
        queryKey: orpc.admin.gestures.listAll.queryOptions({
          includeInactive: true,
          limit: 500,
        }).queryKey,
      });
    },
    onError: (error) => {
      toast.error(`Failed to save changes: ${error.message}`);
    },
  });

  const getGestureWithChanges = (gesture: Gesture): Gesture => {
    return {
      ...gesture,
      ...pendingChanges[gesture._id],
    };
  };

  const updatePendingChange = (
    gestureId: string,
    field: keyof Gesture,
    value: unknown
  ) => {
    setPendingChanges((prev) => ({
      ...prev,
      [gestureId]: {
        ...prev[gestureId],
        [field]: value,
      },
    }));
  };

  const hasChanges = Object.keys(pendingChanges).length > 0;

  const getChangesForConfirmation = (): GestureChange[] => {
    return Object.entries(pendingChanges).map(([gestureId, changes]) => {
      const originalGesture = gestures?.find((g) => g._id === gestureId);
      const gestureChanges: Record<string, { old: unknown; new: unknown }> = {};

      for (const [field, newValue] of Object.entries(changes)) {
        const oldValue = originalGesture?.[field as keyof Gesture];
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          gestureChanges[field] = { old: oldValue, new: newValue };
        }
      }

      return {
        gesture: originalGesture!,
        changes: gestureChanges,
      };
    });
  };

  const handleSaveChanges = () => {
    const changes = Object.entries(pendingChanges).map(
      ([gestureId, updates]) => ({
        gestureId,
        updates,
      })
    );
    bulkUpdateMutation.mutate(changes);
  };

  const discardChanges = () => {
    setPendingChanges({});
    toast.info("Changes discarded");
  };

  // Filter gestures
  const filteredGestures = useMemo(() => {
    if (!gestures) {
      return [];
    }

    let filtered = gestures;

    if (showInactiveOnly) {
      filtered = filtered.filter((g) => !g.isActive);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (gesture) =>
          gesture.name.toLowerCase().includes(query) ||
          gesture.info.toLowerCase().includes(query) ||
          gesture.concept.some((c) => c.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [gestures, searchQuery, showInactiveOnly]);

  // Stats
  const stats = useMemo(() => {
    if (!gestures) {
      return { total: 0, active: 0, inactive: 0 };
    }
    const total = gestures.length;
    const active = gestures.filter((g) => g.isActive).length;
    const inactive = total - active;
    return { total, active, inactive };
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
      {/* Header */}
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
          {hasChanges && (
            <>
              <Button
                className="gap-2"
                onClick={discardChanges}
                size="sm"
                variant="outline"
              >
                <X className="h-4 w-4" />
                Discard ({Object.keys(pendingChanges).length})
              </Button>
              <Button
                className="gap-2"
                onClick={() => setShowConfirmation(true)}
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
          className={`h-10 gap-2 ${showInactiveOnly ? "bg-[var(--admin-accent)] text-white hover:bg-[var(--admin-accent-dark)]" : ""}`}
          onClick={() => setShowInactiveOnly(!showInactiveOnly)}
          size="sm"
          variant={showInactiveOnly ? "default" : "outline"}
        >
          <Filter className="h-4 w-4" />
          {showInactiveOnly ? "Showing Hidden" : "Show Hidden"}
          {stats.inactive > 0 && (
            <Badge
              className="ml-1"
              variant={showInactiveOnly ? "secondary" : "outline"}
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
                  const displayGesture = getGestureWithChanges(gesture);
                  const hasPendingChanges = !!pendingChanges[gesture._id];

                  return (
                    <TableRow
                      className={`group ${hasPendingChanges ? "bg-[var(--admin-accent)]/5" : ""} ${displayGesture.isActive ? "" : "opacity-60"}`}
                      key={gesture._id}
                    >
                      {/* Active Toggle */}
                      <TableCell>
                        <Switch
                          checked={displayGesture.isActive}
                          className="scale-75"
                          onCheckedChange={(checked) =>
                            updatePendingChange(
                              gesture._id,
                              "isActive",
                              checked
                            )
                          }
                        />
                      </TableCell>

                      {/* Name */}
                      <TableCell className="font-medium">
                        {editingCell?.gestureId === gesture._id &&
                        editingCell?.field === "name" ? (
                          <EditableCell
                            onBlur={() => setEditingCell(null)}
                            onChange={(value) =>
                              updatePendingChange(gesture._id, "name", value)
                            }
                            value={displayGesture.name}
                          />
                        ) : (
                          <button
                            className="text-left hover:text-[var(--admin-accent)]"
                            onClick={() =>
                              setEditingCell({
                                gestureId: gesture._id,
                                field: "name",
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setEditingCell({
                                  gestureId: gesture._id,
                                  field: "name",
                                });
                              }
                            }}
                            type="button"
                          >
                            {displayGesture.name}
                          </button>
                        )}
                      </TableCell>

                      {/* Categories */}
                      <TableCell>
                        <CategoriesCell
                          categories={categories || []}
                          categoryIds={displayGesture.categoryIds}
                          onChange={(categoryIds) =>
                            updatePendingChange(
                              gesture._id,
                              "categoryIds",
                              categoryIds
                            )
                          }
                        />
                      </TableCell>

                      {/* Concepts */}
                      <TableCell>
                        <ConceptsCell
                          concepts={displayGesture.concept}
                          onChange={(concepts) =>
                            updatePendingChange(
                              gesture._id,
                              "concept",
                              concepts
                            )
                          }
                        />
                      </TableCell>

                      {/* Info/Description */}
                      <TableCell>
                        {editingCell?.gestureId === gesture._id &&
                        editingCell?.field === "info" ? (
                          <EditableCell
                            multiline
                            onBlur={() => setEditingCell(null)}
                            onChange={(value) =>
                              updatePendingChange(gesture._id, "info", value)
                            }
                            value={displayGesture.info}
                          />
                        ) : (
                          <button
                            className="line-clamp-2 max-w-[300px] text-left text-sm hover:text-[var(--admin-accent)]"
                            onClick={() =>
                              setEditingCell({
                                gestureId: gesture._id,
                                field: "info",
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setEditingCell({
                                  gestureId: gesture._id,
                                  field: "info",
                                });
                              }
                            }}
                            type="button"
                          >
                            {displayGesture.info || (
                              <span className="text-[var(--admin-text-muted)] italic">
                                Click to add description...
                              </span>
                            )}
                          </button>
                        )}
                      </TableCell>

                      {/* Playback ID */}
                      <TableCell>
                        {editingCell?.gestureId === gesture._id &&
                        editingCell?.field === "playbackId" ? (
                          <EditableCell
                            className="font-mono text-xs"
                            onBlur={() => setEditingCell(null)}
                            onChange={(value) =>
                              updatePendingChange(
                                gesture._id,
                                "playbackId",
                                value
                              )
                            }
                            value={displayGesture.playbackId}
                          />
                        ) : (
                          <button
                            className="rounded bg-[var(--admin-bg)] px-2 py-1 font-mono text-xs hover:text-[var(--admin-accent)]"
                            onClick={() =>
                              setEditingCell({
                                gestureId: gesture._id,
                                field: "playbackId",
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setEditingCell({
                                  gestureId: gesture._id,
                                  field: "playbackId",
                                });
                              }
                            }}
                            type="button"
                          >
                            {displayGesture.playbackId.slice(0, 12)}...
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

      {/* Confirmation Dialog */}
      <ChangesConfirmationDialog
        changes={getChangesForConfirmation()}
        isOpen={showConfirmation}
        isSubmitting={bulkUpdateMutation.isPending}
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleSaveChanges}
      />
    </div>
  );
}
