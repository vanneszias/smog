import MuxPlayer from "@mux/mux-player-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  const [sponsorshipDialog, setSponsorshipDialog] = useState<string | null>(
    null
  );

  const { data: gestures, isLoading } = useQuery(
    orpc.admin.gestures.listAll.queryOptions({
      includeInactive: true,
      limit: 500,
    })
  );

  // Get sponsorship info for selected gesture - fetch when dialog is opened
  type ActiveSponsorship = {
    _id: string;
    sponsorName: string;
    sponsorEmail: string;
    overlayText: string;
    overlayImageStorageId: string;
    originalVideoPlaybackId: string;
    sponsoredVideoPlaybackId?: string;
    startDate: number;
    endDate: number;
    durationWeeks: number;
  };

  const [activeSponsorshipData, setActiveSponsorshipData] =
    useState<ActiveSponsorship | null>(null);

  useEffect(() => {
    if (sponsorshipDialog) {
      client.admin.sponsorships
        .getActiveByGesture({ gestureId: sponsorshipDialog })
        .then(setActiveSponsorshipData)
        .catch(() => setActiveSponsorshipData(null));
    } else {
      setActiveSponsorshipData(null);
    }
  }, [sponsorshipDialog]);

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

  const restoreVideoMutation = useMutation({
    mutationFn: (gestureId: string) =>
      client.admin.sponsorships.restoreOriginalVideo({ gestureId }),
    onSuccess: () => {
      toast.success("Original video restored");
      queryClient.invalidateQueries({
        queryKey: orpc.admin.gestures.listAll.queryOptions({
          includeInactive: true,
          limit: 500,
        }).queryKey,
      });
      setSponsorshipDialog(null);
    },
    onError: (error) => {
      toast.error(`Failed to restore: ${error.message}`);
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

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
              <div className="flex-1 space-y-2">
                <h3 className="font-semibold">{gesture.name}</h3>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-muted-foreground text-xs">
                    {gesture.playbackId}
                  </p>
                  <Button
                    className="h-6 w-6 p-0"
                    onClick={() =>
                      copyToClipboard(gesture.playbackId, "Playback ID")
                    }
                    size="sm"
                    variant="ghost"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  {gesture.info.substring(0, 100)}...
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={gesture.isActive} disabled />
                <Button
                  onClick={() => setSponsorshipDialog(gesture._id)}
                  size="sm"
                  variant="outline"
                >
                  Sponsorship
                </Button>
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

      {/* Sponsorship Dialog */}
      <Dialog
        onOpenChange={() => setSponsorshipDialog(null)}
        open={!!sponsorshipDialog}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Sponsorship Information</DialogTitle>
            <DialogDescription>
              {gestures?.find((g) => g._id === sponsorshipDialog)?.name ||
                "Gesture"}
            </DialogDescription>
          </DialogHeader>

          {activeSponsorshipData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Original Video */}
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Original Video</h4>
                  <div className="aspect-video overflow-hidden rounded-md bg-muted">
                    <MuxPlayer
                      loop
                      muted
                      playbackId={activeSponsorshipData.originalVideoPlaybackId}
                      streamType="on-demand"
                      style={{ width: "100%", height: "100%" }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="break-all font-mono text-muted-foreground text-xs">
                      {activeSponsorshipData.originalVideoPlaybackId}
                    </p>
                    <Button
                      className="h-6 w-6 p-0"
                      onClick={() =>
                        copyToClipboard(
                          activeSponsorshipData.originalVideoPlaybackId,
                          "Original Playback ID"
                        )
                      }
                      size="sm"
                      variant="ghost"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Sponsored Video */}
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">
                    Sponsored Video (Current)
                  </h4>
                  {activeSponsorshipData.sponsoredVideoPlaybackId ? (
                    <>
                      <div className="aspect-video overflow-hidden rounded-md bg-muted">
                        <MuxPlayer
                          loop
                          muted
                          playbackId={
                            activeSponsorshipData.sponsoredVideoPlaybackId
                          }
                          streamType="on-demand"
                          style={{ width: "100%", height: "100%" }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="break-all font-mono text-muted-foreground text-xs">
                          {activeSponsorshipData.sponsoredVideoPlaybackId}
                        </p>
                        <Button
                          className="h-6 w-6 p-0"
                          onClick={() =>
                            copyToClipboard(
                              activeSponsorshipData.sponsoredVideoPlaybackId ||
                                "",
                              "Sponsored Playback ID"
                            )
                          }
                          size="sm"
                          variant="ghost"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex aspect-video items-center justify-center rounded-md bg-muted text-muted-foreground text-sm">
                      No sponsored video
                    </div>
                  )}
                </div>
              </div>

              {/* Sponsorship Details */}
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Sponsor</p>
                    <p className="text-muted-foreground text-sm">
                      {activeSponsorshipData.sponsorName} (
                      {activeSponsorshipData.sponsorEmail})
                    </p>
                  </div>
                  <Badge>Active</Badge>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="font-medium text-sm">Duration</p>
                    <p className="text-muted-foreground text-sm">
                      {activeSponsorshipData.durationWeeks} weeks
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-sm">Start Date</p>
                    <p className="text-muted-foreground text-sm">
                      {new Date(
                        activeSponsorshipData.startDate
                      ).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-sm">End Date</p>
                    <p className="text-muted-foreground text-sm">
                      {new Date(
                        activeSponsorshipData.endDate
                      ).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="font-medium text-sm">Overlay Text</p>
                  <p className="text-muted-foreground text-sm">
                    "{activeSponsorshipData.overlayText}"
                  </p>
                </div>

                {!!activeSponsorshipData.overlayImageStorageId && (
                  <div>
                    <p className="font-medium text-sm">Overlay Image</p>
                    <img
                      alt="Overlay"
                      className="mt-2 h-24 w-auto rounded border object-contain"
                      height={96}
                      src={activeSponsorshipData.overlayImageStorageId}
                      width={96}
                    />
                  </div>
                )}

                <div className="flex gap-2 border-t pt-3">
                  <Button
                    disabled={restoreVideoMutation.isPending}
                    onClick={() => {
                      if (sponsorshipDialog) {
                        restoreVideoMutation.mutate(sponsorshipDialog);
                      }
                    }}
                    size="sm"
                    variant="destructive"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Restore Original Video
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No active sponsorship for this gesture
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
