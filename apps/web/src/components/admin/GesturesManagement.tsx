import MuxPlayer from "@mux/mux-player-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  Filter,
  Pencil,
  Play,
  Search,
  Sparkles,
  Tag,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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

interface GestureWithCategories extends Gesture {
  categories: Array<{ _id: string; name: string } | undefined>;
}

function GestureCard({
  gesture,
  isSelected,
  onClick,
}: {
  gesture: GestureWithCategories;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isInactive = !gesture.isActive;
  const validCategories = gesture.categories.filter(Boolean);

  return (
    <button
      className={`group relative w-full overflow-hidden rounded-xl border text-left transition-all duration-200 ${
        isSelected
          ? "border-[var(--admin-accent)] bg-[var(--admin-accent)]/5 ring-2 ring-[var(--admin-accent)]/20"
          : "border-[var(--admin-border)] bg-[var(--admin-card)] hover:border-[var(--admin-accent)]/30 hover:shadow-md"
      } ${isInactive ? "opacity-70" : ""}`}
      onClick={onClick}
      type="button"
    >
      {/* Video Thumbnail */}
      <div className="relative aspect-video overflow-hidden bg-[var(--admin-bg)]">
        <img
          alt={gesture.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          height={135}
          loading="lazy"
          src={`https://image.mux.com/${gesture.playbackId}/thumbnail.webp?width=320&height=180&time=1`}
          width={320}
        />
        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
          <div className="scale-0 rounded-full bg-white/90 p-3 shadow-lg transition-transform group-hover:scale-100">
            <Play className="h-5 w-5 text-[var(--admin-accent)]" />
          </div>
        </div>
        {/* Status badge */}
        {isInactive && (
          <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-white text-xs backdrop-blur-sm">
            <EyeOff className="h-3 w-3" />
            Hidden
          </div>
        )}
        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute top-2 right-2 h-3 w-3 rounded-full border-2 border-white bg-[var(--admin-accent)] shadow-md" />
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="mb-2 truncate font-semibold text-[var(--admin-text)] text-sm">
          {gesture.name}
        </h3>

        {/* Categories */}
        <div className="flex flex-wrap gap-1">
          {validCategories.slice(0, 2).map((cat) =>
            cat ? (
              <span
                className="rounded-md bg-[var(--admin-accent)]/10 px-2 py-0.5 text-[var(--admin-accent)] text-xs"
                key={cat._id}
              >
                {cat.name}
              </span>
            ) : null
          )}
          {validCategories.length > 2 && (
            <span className="rounded-md bg-[var(--admin-bg)] px-2 py-0.5 text-[var(--admin-text-muted)] text-xs">
              +{validCategories.length - 2}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function GestureDetailPanel({
  gesture,
  gestureWithCategories,
  onEdit,
}: {
  gesture: Gesture;
  gestureWithCategories: GestureWithCategories;
  onEdit: (gesture: Gesture) => void;
}) {
  const validCategories = gestureWithCategories.categories.filter(Boolean);

  return (
    <div className="sticky top-24 space-y-4 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-bg)] p-4">
      {/* Video Preview */}
      <div className="overflow-hidden rounded-xl">
        <MuxPlayer
          loop
          muted
          playbackId={gesture.playbackId}
          streamType="on-demand"
          style={{ width: "100%", aspectRatio: "16/9" }}
        />
      </div>

      {/* Details */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-[var(--admin-text)] text-lg">
              {gesture.name}
            </h3>
            <div className="mt-1 flex items-center gap-2">
              {gesture.isActive ? (
                <span className="flex items-center gap-1 text-[var(--admin-success)] text-xs">
                  <Eye className="h-3 w-3" />
                  Visible
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[var(--admin-text-muted)] text-xs">
                  <EyeOff className="h-3 w-3" />
                  Hidden
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Categories */}
        {validCategories.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
              <Tag className="h-3 w-3" />
              Categories
            </p>
            <div className="flex flex-wrap gap-1.5">
              {validCategories.map((cat) =>
                cat ? (
                  <Badge key={cat._id} variant="secondary">
                    {cat.name}
                  </Badge>
                ) : null
              )}
            </div>
          </div>
        )}

        {/* Description */}
        {gesture.info && (
          <div>
            <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
              Description
            </p>
            <p className="text-[var(--admin-text-secondary)] text-sm leading-relaxed">
              {gesture.info}
            </p>
          </div>
        )}

        {/* Playback ID */}
        <div>
          <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
            Playback ID
          </p>
          <code className="block break-all rounded-lg bg-[var(--admin-card)] p-2 font-mono text-[var(--admin-text-secondary)] text-xs">
            {gesture.playbackId}
          </code>
        </div>
      </div>

      {/* Actions */}
      <Button className="w-full gap-2" onClick={() => onEdit(gesture)}>
        <Pencil className="h-4 w-4" />
        Edit Gesture
      </Button>
    </div>
  );
}

export function GesturesManagement() {
  const queryClient = useQueryClient();
  const [selectedGestureId, setSelectedGestureId] = useState<string | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactiveOnly, setShowInactiveOnly] = useState(false);
  const [editDialog, setEditDialog] = useState<Gesture | null>(null);
  const [editForm, setEditForm] = useState<Partial<Gesture>>({});

  const { data: gestures, isLoading } = useQuery(
    orpc.admin.gestures.listAll.queryOptions({
      includeInactive: true,
      limit: 500,
    })
  );

  const { data: categories } = useQuery(orpc.categories.list.queryOptions());

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Gesture> & { gestureId: string }) =>
      client.admin.gestures.update(data),
    onSuccess: () => {
      toast.success("Gesture updated successfully");
      setEditDialog(null);
      queryClient.invalidateQueries({
        queryKey: orpc.admin.gestures.listAll.queryOptions({
          includeInactive: true,
          limit: 500,
        }).queryKey,
      });
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const handleEdit = (gesture: Gesture) => {
    setEditDialog(gesture);
    setEditForm({
      name: gesture.name,
      info: gesture.info,
      playbackId: gesture.playbackId,
      concept: gesture.concept,
      isActive: gesture.isActive,
    });
  };

  const handleSaveEdit = () => {
    if (!editDialog) {
      return;
    }
    updateMutation.mutate({
      gestureId: editDialog._id,
      ...editForm,
    });
  };

  // Transform gestures data
  const gesturesWithCategories: GestureWithCategories[] = useMemo(() => {
    return (
      gestures?.map((gesture) => ({
        ...gesture,
        categories: gesture.categoryIds.map((catId) => {
          const cat = categories?.find((c) => c._id === catId);
          return cat ? { _id: cat._id, name: cat.name } : undefined;
        }),
      })) || []
    );
  }, [gestures, categories]);

  // Count stats
  const stats = useMemo(() => {
    const total = gesturesWithCategories.length;
    const active = gesturesWithCategories.filter((g) => g.isActive).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [gesturesWithCategories]);

  // Filter
  const filteredGestures = useMemo(() => {
    let filtered = gesturesWithCategories;

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
  }, [gesturesWithCategories, searchQuery, showInactiveOnly]);

  const selectedGesture = gestures?.find((g) => g._id === selectedGestureId);
  const selectedGestureWithCategories = gesturesWithCategories.find(
    (g) => g._id === selectedGestureId
  );

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
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Stats */}
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

        {/* Actions */}
        <CreateGestureDialog />
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--admin-text-muted)]" />
          <Input
            className="h-11 bg-[var(--admin-bg)] pl-10"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search gestures by name, description, or concept..."
            value={searchQuery}
          />
        </div>
        <Button
          className={`h-11 gap-2 ${showInactiveOnly ? "bg-[var(--admin-accent)] text-white hover:bg-[var(--admin-accent-dark)]" : ""}`}
          onClick={() => setShowInactiveOnly(!showInactiveOnly)}
          variant={showInactiveOnly ? "default" : "outline"}
        >
          <Filter className="h-4 w-4" />
          {showInactiveOnly ? "Showing Hidden" : "Show Hidden Only"}
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

      {/* Main Content */}
      <div className="flex gap-6">
        {/* Gesture Grid */}
        <div className="min-w-0 flex-1">
          {filteredGestures.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-[var(--admin-border)] border-dashed text-center">
              <EyeOff className="mb-3 h-10 w-10 text-[var(--admin-text-muted)]" />
              <p className="font-medium text-[var(--admin-text)]">
                {showInactiveOnly ? "No hidden gestures" : "No gestures found"}
              </p>
              <p className="text-[var(--admin-text-muted)] text-sm">
                {showInactiveOnly
                  ? "All gestures are currently visible"
                  : "Try adjusting your search terms"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {filteredGestures.map((gesture) => (
                <GestureCard
                  gesture={gesture}
                  isSelected={selectedGestureId === gesture._id}
                  key={gesture._id}
                  onClick={() => setSelectedGestureId(gesture._id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="w-80 shrink-0">
          {selectedGesture && selectedGestureWithCategories ? (
            <GestureDetailPanel
              gesture={selectedGesture}
              gestureWithCategories={selectedGestureWithCategories}
              onEdit={handleEdit}
            />
          ) : (
            <div className="sticky top-24 flex h-64 flex-col items-center justify-center rounded-2xl border border-[var(--admin-border)] border-dashed text-center">
              <Play className="mb-3 h-10 w-10 text-[var(--admin-text-muted)]" />
              <p className="font-medium text-[var(--admin-text)]">
                Select a gesture
              </p>
              <p className="text-[var(--admin-text-muted)] text-sm">
                Click on any gesture to view details
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog onOpenChange={() => setEditDialog(null)} open={!!editDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-[var(--admin-accent)]" />
              Edit Gesture
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                placeholder="Gesture name"
                value={editForm.name || ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="playbackId">Mux Playback ID</Label>
              <Input
                className="font-mono text-sm"
                id="playbackId"
                onChange={(e) =>
                  setEditForm({ ...editForm, playbackId: e.target.value })
                }
                placeholder="Mux playback ID"
                value={editForm.playbackId || ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="info">Description</Label>
              <Textarea
                id="info"
                onChange={(e) =>
                  setEditForm({ ...editForm, info: e.target.value })
                }
                placeholder="Describe this gesture..."
                rows={4}
                value={editForm.info || ""}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[var(--admin-border)] bg-[var(--admin-bg)] p-4">
              <div>
                <Label className="text-base" htmlFor="active">
                  Visibility
                </Label>
                <p className="text-[var(--admin-text-muted)] text-sm">
                  {editForm.isActive
                    ? "This gesture is visible to users"
                    : "This gesture is hidden from users"}
                </p>
              </div>
              <Switch
                checked={editForm.isActive}
                id="active"
                onCheckedChange={(checked) =>
                  setEditForm({ ...editForm, isActive: checked })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setEditDialog(null)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={updateMutation.isPending}
              onClick={handleSaveEdit}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
