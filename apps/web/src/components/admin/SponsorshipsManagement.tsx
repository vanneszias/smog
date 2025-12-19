import MuxPlayer from "@mux/mux-player-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { orpc } from "@/utils/orpc";

type Sponsorship = {
  _id: string;
  gestureId: string;
  gestureName?: string;
  sponsorName: string;
  sponsorEmail: string;
  overlayImageStorageId: string;
  overlayText: string;
  sponsoredVideoPlaybackId?: string;
  originalVideoPlaybackId: string;
  startDate: number;
  endDate: number;
  durationWeeks: number;
  status: string;
  molliePaymentId?: string;
  paymentAmount: number;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export function SponsorshipsManagement() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [detailsDialog, setDetailsDialog] = useState<Sponsorship | null>(null);

  const { data: sponsorships, isLoading } = useQuery({
    ...orpc.admin.sponsorships.listAll.queryOptions({
      status: statusFilter === "all" ? undefined : statusFilter,
      limit: 100,
    }),
    // Force refetch when filter changes
    refetchOnMount: true,
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      pending: "secondary",
      pending_payment: "outline",
      pending_approval: "outline",
      active: "default",
      expired: "secondary",
      rejected: "destructive",
    };

    return (
      <Badge variant={variants[status] || "outline"}>
        {status.replace("_", " ")}
      </Badge>
    );
  };

  if (isLoading) {
    return <div className="py-8 text-center">Loading sponsorships...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <span className="font-medium text-sm">Filter by status:</span>
        <Select onValueChange={setStatusFilter} value={statusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="pending_payment">Pending Payment</SelectItem>
            <SelectItem value="pending_approval">Pending Approval</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {!sponsorships || sponsorships.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No sponsorships found
          </div>
        ) : (
          sponsorships.map((sponsorship) => (
            <div
              className="flex items-center justify-between rounded-lg border p-4"
              key={sponsorship._id}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">
                    {sponsorship.gestureName || "Unknown"}
                  </h3>
                  {getStatusBadge(sponsorship.status)}
                </div>
                <p className="text-muted-foreground text-sm">
                  {sponsorship.sponsorName} | €
                  {(sponsorship.paymentAmount / 100).toFixed(2)} |{" "}
                  {sponsorship.durationWeeks}w
                </p>
                {sponsorship.status === "active" && (
                  <p className="text-muted-foreground text-xs">
                    Expires:{" "}
                    {new Date(sponsorship.endDate).toLocaleDateString()}
                  </p>
                )}
                {sponsorship.rejectionReason ? (
                  <p className="text-red-600 text-xs">
                    Reason: {sponsorship.rejectionReason}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setDetailsDialog(sponsorship as Sponsorship)}
                  size="sm"
                  variant="outline"
                >
                  View Details
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Details Dialog */}
      <Dialog
        onOpenChange={() => setDetailsDialog(null)}
        open={!!detailsDialog}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Sponsorship Details</DialogTitle>
            <DialogDescription>
              {detailsDialog?.gestureName || "Unknown Gesture"}
            </DialogDescription>
          </DialogHeader>

          {!!detailsDialog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Original Video */}
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Original Video</h4>
                  <div className="aspect-video overflow-hidden rounded-md bg-muted">
                    <MuxPlayer
                      loop
                      muted
                      playbackId={detailsDialog.originalVideoPlaybackId}
                      streamType="on-demand"
                      style={{ width: "100%", height: "100%" }}
                    />
                  </div>
                  <p className="break-all font-mono text-muted-foreground text-xs">
                    {detailsDialog.originalVideoPlaybackId}
                  </p>
                </div>

                {/* Sponsored Video */}
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Sponsored Video</h4>
                  {detailsDialog.sponsoredVideoPlaybackId ? (
                    <>
                      <div className="aspect-video overflow-hidden rounded-md bg-muted">
                        <MuxPlayer
                          loop
                          muted
                          playbackId={detailsDialog.sponsoredVideoPlaybackId}
                          streamType="on-demand"
                          style={{ width: "100%", height: "100%" }}
                        />
                      </div>
                      <p className="break-all font-mono text-muted-foreground text-xs">
                        {detailsDialog.sponsoredVideoPlaybackId}
                      </p>
                    </>
                  ) : (
                    <div className="flex aspect-video items-center justify-center rounded-md bg-muted text-muted-foreground text-sm">
                      No sponsored video
                    </div>
                  )}
                </div>
              </div>

              {/* Sponsorship Info */}
              <div className="space-y-3 rounded-lg border p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="font-medium text-sm">Sponsor</p>
                    <p className="text-muted-foreground text-sm">
                      {detailsDialog.sponsorName}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {detailsDialog.sponsorEmail}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-sm">Status</p>
                    {getStatusBadge(detailsDialog.status)}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="font-medium text-sm">Amount</p>
                    <p className="text-muted-foreground text-sm">
                      €{(detailsDialog.paymentAmount / 100).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-sm">Duration</p>
                    <p className="text-muted-foreground text-sm">
                      {detailsDialog.durationWeeks} weeks
                    </p>
                  </div>
                  {!!detailsDialog.molliePaymentId && (
                    <div>
                      <p className="font-medium text-sm">Payment ID</p>
                      <p className="break-all font-mono text-muted-foreground text-xs">
                        {detailsDialog.molliePaymentId}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <p className="font-medium text-sm">Overlay Text</p>
                  <p className="text-muted-foreground text-sm">
                    "{detailsDialog.overlayText}"
                  </p>
                </div>

                {!!detailsDialog.overlayImageStorageId && (
                  <div>
                    <p className="font-medium text-sm">Overlay Image</p>
                    <img
                      alt="Overlay"
                      className="mt-2 h-24 w-auto rounded border object-contain"
                      height={96}
                      src={detailsDialog.overlayImageStorageId}
                      width={96}
                    />
                  </div>
                )}

                {detailsDialog.status === "active" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="font-medium text-sm">Start Date</p>
                      <p className="text-muted-foreground text-sm">
                        {new Date(detailsDialog.startDate).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-sm">End Date</p>
                      <p className="text-muted-foreground text-sm">
                        {new Date(detailsDialog.endDate).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}

                {!!detailsDialog.rejectionReason && (
                  <div>
                    <p className="font-medium text-sm">Rejection Reason</p>
                    <p className="text-muted-foreground text-sm">
                      {detailsDialog.rejectionReason}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 border-t pt-3">
                  <div>
                    <p className="font-medium text-sm">Created</p>
                    <p className="text-muted-foreground text-sm">
                      {new Date(detailsDialog.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-sm">Last Updated</p>
                    <p className="text-muted-foreground text-sm">
                      {new Date(detailsDialog.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
