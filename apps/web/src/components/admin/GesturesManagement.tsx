import { GestureList } from "@smog/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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

type Gesture = {
  _id: string;
  name: string;
  info: string;
  playbackId: string;
  concept: string[];
  isActive: boolean;
  categoryIds: string[];
};

export function GesturesManagement() {
  const queryClient = useQueryClient();
  const [selectedGestureId, setSelectedGestureId] = useState<string | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
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

  // Transform gestures data to match GestureCardData format
  const gesturesWithCategories =
    gestures?.map((gesture) => ({
      ...gesture,
      categories: gesture.categoryIds.map((catId) => {
        const cat = categories?.find((c) => c._id === catId);
        return cat ? { _id: cat._id, name: cat.name } : undefined;
      }),
    })) || [];

  // Filter by search query
  const filteredGestures = useMemo(() => {
    if (!searchQuery.trim()) {
      return gesturesWithCategories;
    }

    const query = searchQuery.toLowerCase();
    return gesturesWithCategories.filter(
      (gesture) =>
        gesture.name.toLowerCase().includes(query) ||
        gesture.info.toLowerCase().includes(query) ||
        gesture.concept.some((c) => c.toLowerCase().includes(query))
    );
  }, [gesturesWithCategories, searchQuery]);

  const selectedGesture = gestures?.find((g) => g._id === selectedGestureId);

  if (isLoading) {
    return <div className="py-8 text-center">Loading gestures...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div>
        <Input
          className="max-w-md"
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, description, or concept..."
          value={searchQuery}
        />
      </div>

      <div className="flex h-[calc(100vh-350px)] gap-4 overflow-hidden">
        {/* Gesture List */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
          <GestureList
            gestures={filteredGestures}
            isLoading={isLoading}
            onSelectGesture={setSelectedGestureId}
            selectedGestureId={selectedGestureId}
          />
        </div>

        {/* Gesture Details & Actions */}
        <div className="w-80 shrink-0 space-y-4 overflow-auto">
          {selectedGesture ? (
            <>
              <div className="rounded-lg border p-4">
                <h3 className="mb-2 font-semibold">{selectedGesture.name}</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="font-medium">Playback ID:</p>
                    <p className="break-all font-mono text-muted-foreground text-xs">
                      {selectedGesture.playbackId}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium">Status:</p>
                    <p className="text-muted-foreground">
                      {selectedGesture.isActive ? "Active" : "Inactive"}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium">Description:</p>
                    <p className="text-muted-foreground">
                      {selectedGesture.info}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={() => handleEdit(selectedGesture)}
                  variant="outline"
                >
                  Edit Gesture
                </Button>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border p-4 text-center text-muted-foreground">
              Select a gesture to view details
            </div>
          )}
        </div>

        {/* Edit Dialog */}
        <Dialog onOpenChange={() => setEditDialog(null)} open={!!editDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Gesture</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  value={editForm.name || ""}
                />
              </div>
              <div>
                <Label htmlFor="playbackId">Mux Playback ID</Label>
                <Input
                  id="playbackId"
                  onChange={(e) =>
                    setEditForm({ ...editForm, playbackId: e.target.value })
                  }
                  value={editForm.playbackId || ""}
                />
              </div>
              <div>
                <Label htmlFor="info">Description</Label>
                <Textarea
                  id="info"
                  onChange={(e) =>
                    setEditForm({ ...editForm, info: e.target.value })
                  }
                  rows={4}
                  value={editForm.info || ""}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editForm.isActive}
                  id="active"
                  onCheckedChange={(checked) =>
                    setEditForm({ ...editForm, isActive: checked })
                  }
                />
                <Label htmlFor="active">Active</Label>
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
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
