import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
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
        queryKey: orpc.admin.sponsorships.listPendingApproval.getQueryKey(),
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
        queryKey: orpc.admin.sponsorships.listPendingApproval.getQueryKey(),
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
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="font-semibold">
                {sponsorship.gestureName || "Unknown Gesture"}
              </h3>
              <p className="text-muted-foreground text-sm">
                Sponsor: {sponsorship.sponsorName} ({sponsorship.sponsorEmail})
              </p>
              <p className="text-sm">
                Amount: €{(sponsorship.paymentAmount / 100).toFixed(2)} |
                Duration: {sponsorship.durationWeeks} weeks
              </p>
              <p className="text-sm">
                Overlay Text: "{sponsorship.overlayText}"
              </p>
              <p className="text-muted-foreground text-xs">
                Created: {new Date(sponsorship.createdAt).toLocaleString()}
              </p>
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
