import MuxPlayer from "@mux/mux-player-react";
import { GestureList } from "@smog/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { client, orpc } from "@/utils/orpc";

export function PendingSponsorships() {
  const queryClient = useQueryClient();
  const [selectedSponsorshipId, setSelectedSponsorshipId] = useState<
    string | null
  >(null);
  const [rejectDialog, setRejectDialog] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: sponsorships, isLoading } = useQuery(
    orpc.admin.sponsorships.listPendingApproval.queryOptions()
  );

  const approveMutation = useMutation({
    mutationFn: (sponsorshipId: string) =>
      client.admin.sponsorships.approve({ sponsorshipId }),
    onSuccess: () => {
      toast.success("Sponsorship approved successfully");
      queryClient.invalidateQueries({
        queryKey:
          orpc.admin.sponsorships.listPendingApproval.queryOptions().queryKey,
      });
      setSelectedSponsorshipId(null);
    },
    onError: (error) => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({
      sponsorshipId,
      reason,
    }: {
      sponsorshipId: string;
      reason: string;
    }) => client.admin.sponsorships.reject({ sponsorshipId, reason }),
    onSuccess: () => {
      toast.success("Sponsorship rejected");
      setRejectDialog(null);
      setRejectReason("");
      setSelectedSponsorshipId(null);
      queryClient.invalidateQueries({
        queryKey:
          orpc.admin.sponsorships.listPendingApproval.queryOptions().queryKey,
      });
    },
    onError: (error) => {
      toast.error(`Failed to reject: ${error.message}`);
    },
  });

  // Transform sponsorships to gesture list format
  const gesturesWithCategories = useMemo(() => {
    if (!sponsorships) {
      return [];
    }

    return sponsorships
      .filter(
        (s) =>
          !searchQuery ||
          s.gestureName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.sponsorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.sponsorEmail.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .map((sponsorship) => ({
        _id: sponsorship._id,
        name: sponsorship.gestureName || "Unknown Gesture",
        playbackId:
          sponsorship.sponsoredVideoPlaybackId ||
          sponsorship.originalVideoPlaybackId,
        concept: [sponsorship.sponsorName, sponsorship.sponsorEmail],
        info: sponsorship.overlayText,
        categories: [] as Array<{ _id: string; name: string } | undefined>,
      }));
  }, [sponsorships, searchQuery]);

  const selectedSponsorship = sponsorships?.find(
    (s) => s._id === selectedSponsorshipId
  );

  if (isLoading) {
    return (
      <div className="py-8 text-center">Loading pending sponsorships...</div>
    );
  }

  if (!sponsorships || sponsorships.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No pending sponsorships
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-4">
        <Input
          className="max-w-md"
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by gesture, sponsor name, or email..."
          value={searchQuery}
        />
      </div>

      <div className="flex h-[calc(100vh-350px)] gap-4">
        {/* Sponsorship List */}
        <div className="flex-1 overflow-hidden rounded-lg border">
          <GestureList
            gestures={gesturesWithCategories}
            isLoading={isLoading}
            onSelectGesture={setSelectedSponsorshipId}
            selectedGestureId={selectedSponsorshipId}
          />
        </div>

        {/* Sponsorship Details & Actions */}
        <div className="w-96 space-y-4">
          {selectedSponsorship ? (
            <>
              {/* Video Preview */}
              {!!selectedSponsorship.sponsoredVideoPlaybackId && (
                <div className="overflow-hidden rounded-lg border">
                  <MuxPlayer
                    loop
                    muted
                    playbackId={selectedSponsorship.sponsoredVideoPlaybackId}
                    streamType="on-demand"
                    style={{ width: "100%", aspectRatio: "16/9" }}
                  />
                </div>
              )}

              {/* Details */}
              <div className="rounded-lg border p-4">
                <h3 className="mb-2 font-semibold">
                  {selectedSponsorship.gestureName || "Unknown Gesture"}
                </h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium">Sponsor</p>
                    <p className="text-muted-foreground">
                      {selectedSponsorship.sponsorName}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {selectedSponsorship.sponsorEmail}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Badge variant="outline">
                      €{(selectedSponsorship.paymentAmount / 100).toFixed(2)}
                    </Badge>
                    <Badge variant="outline">
                      {selectedSponsorship.durationWeeks} weeks
                    </Badge>
                  </div>

                  <div>
                    <p className="font-medium">Overlay Text</p>
                    <p className="text-muted-foreground">
                      "{selectedSponsorship.overlayText}"
                    </p>
                  </div>

                  {!!selectedSponsorship.overlayImageStorageId && (
                    <div>
                      <p className="font-medium">Overlay Image</p>
                      <img
                        alt="Overlay"
                        className="mt-2 h-20 w-auto rounded border object-contain"
                        height={80}
                        src={selectedSponsorship.overlayImageStorageId}
                        width={80}
                      />
                    </div>
                  )}

                  <div className="border-t pt-3">
                    <p className="font-medium">Playback IDs</p>
                    <p className="break-all font-mono text-muted-foreground text-xs">
                      Original: {selectedSponsorship.originalVideoPlaybackId}
                    </p>
                    <p className="break-all font-mono text-muted-foreground text-xs">
                      New:{" "}
                      {selectedSponsorship.sponsoredVideoPlaybackId || "N/A"}
                    </p>
                  </div>

                  <div>
                    <p className="font-medium">Created</p>
                    <p className="text-muted-foreground">
                      {new Date(selectedSponsorship.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <Button
                  className="w-full"
                  disabled={approveMutation.isPending}
                  onClick={() =>
                    approveMutation.mutate(selectedSponsorship._id)
                  }
                >
                  Approve Sponsorship
                </Button>
                <Button
                  className="w-full"
                  disabled={rejectMutation.isPending}
                  onClick={() => setRejectDialog(selectedSponsorship._id)}
                  variant="destructive"
                >
                  Reject Sponsorship
                </Button>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border p-4 text-center text-muted-foreground">
              Select a sponsorship to review
            </div>
          )}
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog onOpenChange={() => setRejectDialog(null)} open={!!rejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Sponsorship</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this sponsorship
            </DialogDescription>
          </DialogHeader>
          <Textarea
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection..."
            value={rejectReason}
          />
          <DialogFooter>
            <Button onClick={() => setRejectDialog(null)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => {
                if (rejectDialog) {
                  rejectMutation.mutate({
                    sponsorshipId: rejectDialog,
                    reason: rejectReason,
                  });
                }
              }}
              variant="destructive"
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
