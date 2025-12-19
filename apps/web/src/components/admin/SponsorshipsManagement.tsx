import MuxPlayer from "@mux/mux-player-react";
import type { GestureCardData } from "@smog/ui";
import { GestureList } from "@smog/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { client, orpc } from "@/utils/orpc";

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

function SponsorshipDetailsPanel({
  sponsorship,
  onViewDetails,
  onForceExpire,
  isExpiring,
}: {
  sponsorship: Sponsorship;
  onViewDetails: () => void;
  onForceExpire: () => void;
  isExpiring: boolean;
}) {
  return (
    <div className="w-96 space-y-4 overflow-auto rounded-lg border p-4">
      <div className="space-y-2">
        <h3 className="font-semibold text-lg">
          {sponsorship.gestureName || "Unknown"}
        </h3>
        <div className="flex items-center gap-2">
          {getStatusBadge(sponsorship.status)}
        </div>
      </div>

      {/* Video Preview */}
      <div className="space-y-2">
        <h4 className="font-medium text-sm">
          {sponsorship.sponsoredVideoPlaybackId
            ? "Sponsored Video"
            : "Original Video"}
        </h4>
        <div className="aspect-video overflow-hidden rounded-md bg-muted">
          <MuxPlayer
            loop
            muted
            playbackId={
              sponsorship.sponsoredVideoPlaybackId ||
              sponsorship.originalVideoPlaybackId
            }
            streamType="on-demand"
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      </div>

      {/* Sponsorship Info */}
      <div className="space-y-3">
        <div>
          <p className="font-medium text-sm">Sponsor</p>
          <p className="text-muted-foreground text-sm">
            {sponsorship.sponsorName}
          </p>
          <p className="text-muted-foreground text-xs">
            {sponsorship.sponsorEmail}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="font-medium text-sm">Amount</p>
            <p className="text-muted-foreground text-sm">
              €{(sponsorship.paymentAmount / 100).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="font-medium text-sm">Duration</p>
            <p className="text-muted-foreground text-sm">
              {sponsorship.durationWeeks} weeks
            </p>
          </div>
        </div>

        {sponsorship.status === "active" && (
          <div>
            <p className="font-medium text-sm">Expires</p>
            <p className="text-muted-foreground text-sm">
              {new Date(sponsorship.endDate).toLocaleDateString()}
            </p>
          </div>
        )}

        {!!sponsorship.rejectionReason && (
          <div className="rounded-md bg-red-50 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <div>
                <p className="font-medium text-red-600 text-sm">
                  Rejection Reason
                </p>
                <p className="text-red-600 text-xs">
                  {sponsorship.rejectionReason}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2 border-t pt-4">
        <Button
          className="w-full"
          onClick={onViewDetails}
          size="sm"
          variant="outline"
        >
          View Full Details
        </Button>

        {sponsorship.status === "active" && (
          <Button
            className="w-full"
            disabled={isExpiring}
            onClick={onForceExpire}
            size="sm"
            variant="destructive"
          >
            {isExpiring ? "Expiring..." : "Force Expire Sponsorship"}
          </Button>
        )}
      </div>

      <div className="border-t pt-3 text-muted-foreground text-xs">
        <p>Created: {new Date(sponsorship.createdAt).toLocaleString()}</p>
        <p>Updated: {new Date(sponsorship.updatedAt).toLocaleString()}</p>
      </div>
    </div>
  );
}

function SponsorshipDetailsDialog({
  sponsorship,
  onClose,
}: {
  sponsorship: Sponsorship | null;
  onClose: () => void;
}) {
  if (!sponsorship) {
    return null;
  }

  return (
    <Dialog onOpenChange={onClose} open={!!sponsorship}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Sponsorship Details</DialogTitle>
          <DialogDescription>
            {sponsorship.gestureName || "Unknown Gesture"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Original Video */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Original Video</h4>
              <div className="aspect-video overflow-hidden rounded-md bg-muted">
                <MuxPlayer
                  loop
                  muted
                  playbackId={sponsorship.originalVideoPlaybackId}
                  streamType="on-demand"
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
              <p className="break-all font-mono text-muted-foreground text-xs">
                {sponsorship.originalVideoPlaybackId}
              </p>
            </div>

            {/* Sponsored Video */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Sponsored Video</h4>
              {sponsorship.sponsoredVideoPlaybackId ? (
                <>
                  <div className="aspect-video overflow-hidden rounded-md bg-muted">
                    <MuxPlayer
                      loop
                      muted
                      playbackId={sponsorship.sponsoredVideoPlaybackId}
                      streamType="on-demand"
                      style={{ width: "100%", height: "100%" }}
                    />
                  </div>
                  <p className="break-all font-mono text-muted-foreground text-xs">
                    {sponsorship.sponsoredVideoPlaybackId}
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
                  {sponsorship.sponsorName}
                </p>
                <p className="text-muted-foreground text-xs">
                  {sponsorship.sponsorEmail}
                </p>
              </div>
              <div>
                <p className="font-medium text-sm">Status</p>
                {getStatusBadge(sponsorship.status)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="font-medium text-sm">Amount</p>
                <p className="text-muted-foreground text-sm">
                  €{(sponsorship.paymentAmount / 100).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="font-medium text-sm">Duration</p>
                <p className="text-muted-foreground text-sm">
                  {sponsorship.durationWeeks} weeks
                </p>
              </div>
              {!!sponsorship.molliePaymentId && (
                <div>
                  <p className="font-medium text-sm">Payment ID</p>
                  <p className="break-all font-mono text-muted-foreground text-xs">
                    {sponsorship.molliePaymentId}
                  </p>
                </div>
              )}
            </div>

            <div>
              <p className="font-medium text-sm">Overlay Text</p>
              <p className="text-muted-foreground text-sm">
                "{sponsorship.overlayText}"
              </p>
            </div>

            {!!sponsorship.overlayImageStorageId && (
              <div>
                <p className="font-medium text-sm">Overlay Image</p>
                <img
                  alt="Overlay"
                  className="mt-2 h-24 w-auto rounded border object-contain"
                  height={96}
                  src={sponsorship.overlayImageStorageId}
                  width={96}
                />
              </div>
            )}

            {sponsorship.status === "active" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="font-medium text-sm">Start Date</p>
                  <p className="text-muted-foreground text-sm">
                    {new Date(sponsorship.startDate).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-sm">End Date</p>
                  <p className="text-muted-foreground text-sm">
                    {new Date(sponsorship.endDate).toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            {!!sponsorship.rejectionReason && (
              <div>
                <p className="font-medium text-sm">Rejection Reason</p>
                <p className="text-muted-foreground text-sm">
                  {sponsorship.rejectionReason}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 border-t pt-3">
              <div>
                <p className="font-medium text-sm">Created</p>
                <p className="text-muted-foreground text-sm">
                  {new Date(sponsorship.createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="font-medium text-sm">Last Updated</p>
                <p className="text-muted-foreground text-sm">
                  {new Date(sponsorship.updatedAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SponsorshipsManagement() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSponsorshipId, setSelectedSponsorshipId] = useState<
    string | null
  >(null);
  const [detailsDialog, setDetailsDialog] = useState<Sponsorship | null>(null);
  const queryClient = useQueryClient();

  const { data: sponsorships, isLoading } = useQuery({
    ...orpc.admin.sponsorships.listAll.queryOptions({
      status: statusFilter === "all" ? undefined : statusFilter,
      limit: 100,
    }),
    refetchOnMount: true,
  });

  const forceExpireMutation = useMutation({
    mutationFn: async (sponsorshipId: string) => {
      await client.admin.sponsorships.forceExpire.mutate({ sponsorshipId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "sponsorships"],
      });
      setSelectedSponsorshipId(null);
      setDetailsDialog(null);
    },
  });

  // Transform sponsorships to GestureCardData format
  const gestureData: GestureCardData[] = useMemo(() => {
    if (!sponsorships) {
      return [];
    }

    return sponsorships.map((sponsorship) => ({
      _id: sponsorship._id,
      name: sponsorship.gestureName || "Unknown",
      playbackId:
        sponsorship.sponsoredVideoPlaybackId ||
        sponsorship.originalVideoPlaybackId,
      concept: [sponsorship.sponsorName],
      info: `€${(sponsorship.paymentAmount / 100).toFixed(2)} | ${sponsorship.durationWeeks}w`,
      categories: [],
    }));
  }, [sponsorships]);

  // Filter by search query
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) {
      return gestureData;
    }

    const query = searchQuery.toLowerCase();
    return gestureData.filter((item) => {
      const sponsorship = sponsorships?.find((s) => s._id === item._id);
      if (!sponsorship) {
        return false;
      }

      return (
        sponsorship.gestureName?.toLowerCase().includes(query) ||
        sponsorship.sponsorName.toLowerCase().includes(query) ||
        sponsorship.sponsorEmail.toLowerCase().includes(query)
      );
    });
  }, [gestureData, searchQuery, sponsorships]);

  const selectedSponsorship = useMemo(
    () => sponsorships?.find((s) => s._id === selectedSponsorshipId),
    [sponsorships, selectedSponsorshipId]
  );

  if (isLoading) {
    return <div className="py-8 text-center">Loading sponsorships...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter */}
      <div className="flex items-center gap-4">
        <Input
          className="max-w-md"
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by gesture, sponsor name, or email..."
          value={searchQuery}
        />
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">Status:</span>
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
      </div>

      {/* Master-Detail Layout */}
      <div className="flex h-[calc(100vh-350px)] gap-4">
        {/* Gesture List (Master) */}
        <div className="flex-1 overflow-auto">
          {filteredData.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No sponsorships found
            </div>
          ) : (
            <GestureList
              gestures={filteredData}
              onGestureClick={(gesture) =>
                setSelectedSponsorshipId(gesture._id)
              }
              renderBadge={(gesture) => {
                const sponsorship = sponsorships?.find(
                  (s) => s._id === gesture._id
                );
                return sponsorship ? getStatusBadge(sponsorship.status) : null;
              }}
              selectedGestureId={selectedSponsorshipId}
            />
          )}
        </div>

        {/* Details Panel (Detail) */}
        {!!selectedSponsorship && (
          <SponsorshipDetailsPanel
            isExpiring={forceExpireMutation.isPending}
            onForceExpire={() =>
              forceExpireMutation.mutate(selectedSponsorship._id)
            }
            onViewDetails={() => setDetailsDialog(selectedSponsorship)}
            sponsorship={selectedSponsorship}
          />
        )}
      </div>

      {/* Full Details Dialog */}
      <SponsorshipDetailsDialog
        onClose={() => setDetailsDialog(null)}
        sponsorship={detailsDialog}
      />
    </div>
  );
}
