import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [selectedGestures, setSelectedGestures] = useState<Set<string>>(
    new Set()
  );
  const [editDialog, setEditDialog] = useState<Gesture | null>(null);
  const [editForm, setEditForm] = useState<Partial<Gesture>>({});

  const { data: gestures, isLoading } = useQuery(
    orpc.admin.gestures.listAll.queryOptions({
      includeInactive: true,
      limit: 500,
    })
  );

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

  const bulkUpdateMutation = useMutation({
    mutationFn: (data: {
      gestureIds: string[];
      updates: { isActive?: boolean };
    }) => client.admin.gestures.bulkUpdate(data),
    onSuccess: () => {
      toast.success("Gestures updated");
      setSelectedGestures(new Set());
      queryClient.invalidateQueries({
        queryKey: orpc.admin.gestures.listAll.queryOptions({
          includeInactive: true,
          limit: 500,
        }).queryKey,
      });
    },
    onError: (error) => {
      toast.error(`Failed to bulk update: ${error.message}`);
    },
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked && gestures) {
      setSelectedGestures(new Set(gestures.map((g) => g._id)));
    } else {
      setSelectedGestures(new Set());
    }
  };

  const handleSelectGesture = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedGestures);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedGestures(newSelected);
  };

  const handleBulkActivate = (isActive: boolean) => {
    bulkUpdateMutation.mutate({
      gestureIds: Array.from(selectedGestures),
      updates: { isActive },
    });
  };

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

  if (isLoading) {
    return <div className="py-8 text-center">Loading gestures...</div>;
  }

  return (
    <div className="space-y-4">
      {selectedGestures.size > 0 ? (
        <div className="flex items-center gap-4 rounded-lg bg-muted p-4">
          <span className="text-sm">{selectedGestures.size} selected</span>
          <Button
            disabled={bulkUpdateMutation.isPending}
            onClick={() => handleBulkActivate(true)}
            size="sm"
          >
            Activate
          </Button>
          <Button
            disabled={bulkUpdateMutation.isPending}
            onClick={() => handleBulkActivate(false)}
            size="sm"
            variant="secondary"
          >
            Deactivate
          </Button>
          <Button
            onClick={() => setSelectedGestures(new Set())}
            size="sm"
            variant="outline"
          >
            Clear
          </Button>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center gap-2 p-2">
          <Checkbox
            checked={
              gestures ? selectedGestures.size === gestures.length : false
            }
            onCheckedChange={handleSelectAll}
          />
          <span className="font-medium text-sm">Select All</span>
        </div>

        {!gestures || gestures.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No gestures found
          </div>
        ) : (
          gestures.map((gesture) => (
            <div
              className="flex items-center gap-4 rounded-lg border p-4"
              key={gesture._id}
            >
              <Checkbox
                checked={selectedGestures.has(gesture._id)}
                onCheckedChange={(checked) =>
                  handleSelectGesture(gesture._id, checked as boolean)
                }
              />
              <div className="flex-1 space-y-1">
                <h3 className="font-semibold">{gesture.name}</h3>
                <p className="text-muted-foreground text-sm">
                  Playback ID: {gesture.playbackId}
                </p>
                <p className="text-muted-foreground text-xs">
                  {gesture.info.substring(0, 100)}...
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={gesture.isActive} disabled />
                <Button
                  onClick={() => handleEdit(gesture)}
                  size="sm"
                  variant="outline"
                >
                  Edit
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

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
  );
}
