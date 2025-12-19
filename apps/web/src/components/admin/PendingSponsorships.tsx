import MuxPlayer from "@mux/mux-player-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { client, orpc } from "@/utils/orpc";

export function PendingSponsorships() {
  const queryClient = useQueryClient();
  const [rejectDialog, setRejectDialog] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

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
      queryClient.invalidateQueries({
        queryKey:
          orpc.admin.sponsorships.listPendingApproval.queryOptions().queryKey,
      });
    },
    onError: (error) => {
      toast.error(`Failed to reject: ${error.message}`);
    },
  });

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
      {sponsorships.map((sponsorship) => (
        <div className="rounded-lg border p-4" key={sponsorship._id}>
          <div className="flex gap-4">
            {/* Video Preview */}
            <div className="flex-shrink-0">
              {sponsorship.sponsoredVideoPlaybackId ? (
                <div className="h-[180px] w-[240px] overflow-hidden rounded-md">
                  <MuxPlayer
                    loop
                    muted
                    playbackId={sponsorship.sponsoredVideoPlaybackId}
                    streamType="on-demand"
                    style={{ width: "100%", height: "100%" }}
                  />
                </div>
              ) : (
                <div className="flex h-[180px] w-[240px] items-center justify-center rounded-md bg-muted text-muted-foreground text-sm">
                  No video available
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex flex-1 items-start justify-between">
              <div className="space-y-2">
                <div>
                  <h3 className="font-semibold text-lg">
                    {sponsorship.gestureName || "Unknown Gesture"}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Sponsor: {sponsorship.sponsorName} (
                    {sponsorship.sponsorEmail})
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline">
                    €{(sponsorship.paymentAmount / 100).toFixed(2)}
                  </Badge>
                  <Badge variant="outline">
                    {sponsorship.durationWeeks} weeks
                  </Badge>
                </div>
                <p className="text-sm">
                  <span className="font-medium">Overlay Text:</span> "
                  {sponsorship.overlayText}"
                </p>
                {!!sponsorship.overlayImageStorageId && (
                  <div className="space-y-1">
                    <p className="font-medium text-sm">Overlay Image:</p>
                    <img
                      alt="Overlay"
                      className="h-20 w-auto rounded border object-contain"
                      height={80}
                      src={sponsorship.overlayImageStorageId}
                      width={80}
                    />
                  </div>
                )}
                <div className="space-y-1 text-muted-foreground text-xs">
                  <p>
                    Original Video ID: {sponsorship.originalVideoPlaybackId}
                  </p>
                  <p>
                    New Video ID:{" "}
                    {sponsorship.sponsoredVideoPlaybackId || "N/A"}
                  </p>
                  <p>
                    Created: {new Date(sponsorship.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={approveMutation.isPending}
                  onClick={() => approveMutation.mutate(sponsorship._id)}
                  size="sm"
                >
                  Approve
                </Button>
                <Button
                  disabled={rejectMutation.isPending}
                  onClick={() => setRejectDialog(sponsorship._id)}
                  size="sm"
                  variant="destructive"
                >
                  Reject
                </Button>
              </div>
            </div>
          </div>
        </div>
      ))}

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
