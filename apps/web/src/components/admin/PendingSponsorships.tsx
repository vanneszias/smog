import MuxPlayer from "@mux/mux-player-react/lazy";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Euro,
  FileText,
  Image,
  Inbox,
  Link,
  Mail,
  Search,
  User,
  XCircle,
} from "lucide-react";
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

interface PendingSponsorship {
  _id: string;
  gestureName?: string;
  sponsorName: string;
  sponsorEmail: string;
  overlayText: string;
  overlayImageStorageId?: string;
  sponsoredVideoPlaybackId?: string;
  originalVideoPlaybackId?: string;
  paymentAmount: number;
  durationYears: number;
  createdAt: number;
  invoiceRequested?: boolean;
  invoiceName?: string;
  invoiceVatNumber?: string;
  invoiceEmail?: string;
}

function SponsorshipCard({
  sponsorship,
  isSelected,
  onClick,
}: {
  sponsorship: PendingSponsorship;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`group relative w-full overflow-hidden rounded-xl border text-left transition-all duration-200 ${
        isSelected
          ? "border-[var(--admin-accent)] bg-[var(--admin-accent)]/5 ring-2 ring-[var(--admin-accent)]/20"
          : "border-[var(--admin-border)] bg-[var(--admin-card)] hover:border-[var(--admin-accent)]/30 hover:shadow-md"
      }`}
      onClick={onClick}
      type="button"
    >
      {/* Video Thumbnail */}
      <div className="relative aspect-video overflow-hidden bg-[var(--admin-bg)]">
        <img
          alt={sponsorship.gestureName || "Gesture"}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          height={135}
          loading="lazy"
          src={`https://image.mux.com/${sponsorship.sponsoredVideoPlaybackId || sponsorship.originalVideoPlaybackId}/thumbnail.webp?width=320&height=180&time=1`}
          width={320}
        />
        {/* Pending badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-1 text-white text-xs backdrop-blur-sm">
          <Clock className="h-3 w-3" />
          Pending
        </div>
        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute top-2 right-2 h-3 w-3 rounded-full border-2 border-white bg-[var(--admin-accent)] shadow-md" />
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="mb-1 truncate font-semibold text-[var(--admin-text)] text-sm">
          {sponsorship.gestureName || "Unknown Gesture"}
        </h3>
        <p className="mb-3 truncate text-[var(--admin-text-muted)] text-xs">
          {sponsorship.sponsorName}
        </p>

        {/* Info badges */}
        <div className="flex flex-wrap gap-1.5">
          <span className="flex items-center gap-1 rounded-md bg-[var(--admin-bg)] px-2 py-0.5 text-[var(--admin-text-secondary)] text-xs">
            <Euro className="h-3 w-3" />
            {(sponsorship.paymentAmount / 100).toFixed(0)}
          </span>
          <span className="flex items-center gap-1 rounded-md bg-[var(--admin-bg)] px-2 py-0.5 text-[var(--admin-text-secondary)] text-xs">
            <Clock className="h-3 w-3" />
            {sponsorship.durationYears}y
          </span>
        </div>
      </div>
    </button>
  );
}

function filterSponsorships(
  sponsorships: PendingSponsorship[],
  searchQuery: string
): PendingSponsorship[] {
  if (!searchQuery.trim()) {
    return sponsorships;
  }
  const query = searchQuery.toLowerCase();
  return sponsorships.filter(
    (s) =>
      s.gestureName?.toLowerCase().includes(query) ||
      s.sponsorName.toLowerCase().includes(query) ||
      s.sponsorEmail.toLowerCase().includes(query)
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Admin panel with list + detail panel + reject dialog requires inherent branching
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

  const handleApproveSuccess = () => {
    toast.success("Sponsorship approved successfully");
    queryClient.invalidateQueries({
      queryKey:
        orpc.admin.sponsorships.listPendingApproval.queryOptions().queryKey,
    });
    setSelectedSponsorshipId(null);
  };

  const approveMutation = useMutation({
    mutationFn: (sponsorshipId: string) =>
      client.admin.sponsorships.approve({ sponsorshipId }),
    onSuccess: handleApproveSuccess,
    onError: (error) => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });

  const handleReEditLinkSuccess = (data: { url: string }) => {
    navigator.clipboard.writeText(data.url).catch(() => {
      toast.info("Link generated", { description: data.url });
    });
    toast.success("Re-edit link copied to clipboard!", {
      description: "Expires in 7 days",
    });
  };

  const generateReEditLinkMutation = useMutation({
    mutationFn: (sponsorshipId: string) =>
      client.admin.sponsorships.generateReEditLink({ sponsorshipId }),
    onSuccess: handleReEditLinkSuccess,
    onError: (error) => {
      toast.error(`Failed to generate re-edit link: ${error.message}`);
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

  // Filter sponsorships
  const filteredSponsorships = useMemo(
    () => filterSponsorships(sponsorships ?? [], searchQuery),
    [sponsorships, searchQuery]
  );

  const selectedSponsorship = sponsorships?.find(
    (s) => s._id === selectedSponsorshipId
  );

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--admin-accent)] border-t-transparent" />
          <p className="text-[var(--admin-text-muted)] text-sm">
            Loading pending sponsorships...
          </p>
        </div>
      </div>
    );
  }

  if (!sponsorships || sponsorships.length === 0) {
    return (
      <div className="flex h-96 flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--admin-accent)]/10">
          <Inbox className="h-8 w-8 text-[var(--admin-accent)]" />
        </div>
        <h3 className="mb-1 font-semibold text-[var(--admin-text)] text-lg">
          All caught up!
        </h3>
        <p className="text-[var(--admin-text-muted)] text-sm">
          No sponsorships pending approval
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
            <Clock className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <p className="font-semibold text-[var(--admin-text)] text-lg">
              {sponsorships.length}
            </p>
            <p className="text-[var(--admin-text-muted)] text-xs">
              Awaiting Review
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--admin-text-muted)]" />
        <Input
          className="h-11 bg-[var(--admin-bg)] pl-10"
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by gesture, sponsor name, or email..."
          value={searchQuery}
        />
      </div>

      {/* Main Content */}
      <div className="flex gap-6">
        {/* Sponsorship Grid */}
        <div className="min-w-0 flex-1">
          {filteredSponsorships.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-[var(--admin-border)] border-dashed text-center">
              <Search className="mb-3 h-10 w-10 text-[var(--admin-text-muted)]" />
              <p className="font-medium text-[var(--admin-text)]">
                No matches found
              </p>
              <p className="text-[var(--admin-text-muted)] text-sm">
                Try adjusting your search terms
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {filteredSponsorships.map((sponsorship) => (
                <SponsorshipCard
                  isSelected={selectedSponsorshipId === sponsorship._id}
                  key={sponsorship._id}
                  onClick={() => setSelectedSponsorshipId(sponsorship._id)}
                  sponsorship={sponsorship}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="w-96 shrink-0">
          {selectedSponsorship ? (
            <div className="sticky top-24 space-y-4 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-bg)] p-4">
              {/* Video Preview */}
              {selectedSponsorship.sponsoredVideoPlaybackId && (
                <div className="overflow-hidden rounded-xl">
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
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-[var(--admin-text)] text-lg">
                    {selectedSponsorship.gestureName || "Unknown Gesture"}
                  </h3>
                  <Badge className="mt-1" variant="outline">
                    <Clock className="mr-1 h-3 w-3" />
                    Pending Approval
                  </Badge>
                </div>

                {/* Sponsor Info */}
                <div className="space-y-2 rounded-lg bg-[var(--admin-card)] p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-[var(--admin-text-muted)]" />
                    <span className="text-[var(--admin-text)]">
                      {selectedSponsorship.sponsorName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-[var(--admin-text-muted)]" />
                    <span className="text-[var(--admin-text-secondary)]">
                      {selectedSponsorship.sponsorEmail}
                    </span>
                  </div>
                </div>

                {/* Invoice Info */}
                {selectedSponsorship.invoiceRequested && (
                  <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <p className="flex items-center gap-1.5 font-medium text-amber-600 text-xs uppercase tracking-wide">
                      <FileText className="h-3.5 w-3.5" />
                      Factuur gevraagd
                    </p>
                    <div className="space-y-1 text-sm">
                      {selectedSponsorship.invoiceName && (
                        <div className="flex items-start gap-2">
                          <span className="w-20 shrink-0 text-[var(--admin-text-muted)] text-xs">
                            Naam
                          </span>
                          <span className="text-[var(--admin-text)]">
                            {selectedSponsorship.invoiceName}
                          </span>
                        </div>
                      )}
                      {selectedSponsorship.invoiceVatNumber && (
                        <div className="flex items-start gap-2">
                          <span className="w-20 shrink-0 text-[var(--admin-text-muted)] text-xs">
                            Ond.nr.
                          </span>
                          <span className="font-mono text-[var(--admin-text)]">
                            {selectedSponsorship.invoiceVatNumber}
                          </span>
                        </div>
                      )}
                      {selectedSponsorship.invoiceEmail && (
                        <div className="flex items-start gap-2">
                          <span className="w-20 shrink-0 text-[var(--admin-text-muted)] text-xs">
                            E-mail
                          </span>
                          <span className="text-[var(--admin-text)]">
                            {selectedSponsorship.invoiceEmail}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Payment Info */}
                <div className="flex gap-2">
                  <div className="flex-1 rounded-lg bg-[var(--admin-card)] p-3">
                    <p className="mb-1 text-[var(--admin-text-muted)] text-xs">
                      Amount
                    </p>
                    <p className="font-semibold text-[var(--admin-text)]">
                      €{(selectedSponsorship.paymentAmount / 100).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex-1 rounded-lg bg-[var(--admin-card)] p-3">
                    <p className="mb-1 text-[var(--admin-text-muted)] text-xs">
                      Duration
                    </p>
                    <p className="font-semibold text-[var(--admin-text)]">
                      {selectedSponsorship.durationYears} year
                      {selectedSponsorship.durationYears !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                {/* Overlay Text */}
                <div>
                  <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                    Overlay Text
                  </p>
                  <p className="rounded-lg bg-[var(--admin-card)] p-3 text-[var(--admin-text)] text-sm italic">
                    "{selectedSponsorship.overlayText}"
                  </p>
                </div>

                {/* Overlay Image */}
                {selectedSponsorship.overlayImageStorageId && (
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                      <Image className="h-3 w-3" />
                      Overlay Image
                    </p>
                    <img
                      alt="Overlay"
                      className="h-16 w-auto rounded-lg border border-[var(--admin-border)] object-contain"
                      height={64}
                      src={selectedSponsorship.overlayImageStorageId}
                      width={64}
                    />
                  </div>
                )}

                {/* Playback IDs */}
                <div className="space-y-2">
                  <p className="font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                    Playback IDs
                  </p>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--admin-text-muted)]">
                        Original:
                      </span>
                      <code className="flex-1 truncate rounded bg-[var(--admin-card)] px-2 py-1 font-mono text-[var(--admin-text-secondary)]">
                        {selectedSponsorship.originalVideoPlaybackId}
                      </code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--admin-text-muted)]">
                        Sponsored:
                      </span>
                      <code className="flex-1 truncate rounded bg-[var(--admin-card)] px-2 py-1 font-mono text-[var(--admin-text-secondary)]">
                        {selectedSponsorship.sponsoredVideoPlaybackId || "N/A"}
                      </code>
                    </div>
                  </div>
                </div>

                {/* Timestamp */}
                <p className="text-[var(--admin-text-muted)] text-xs">
                  Submitted{" "}
                  {new Date(selectedSponsorship.createdAt).toLocaleDateString(
                    undefined,
                    {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }
                  )}
                </p>
              </div>

              {/* Actions */}
              <div className="space-y-2 border-[var(--admin-border)] border-t pt-4">
                <Button
                  className="w-full gap-2 bg-[var(--admin-success)] hover:bg-[var(--admin-success)]/90"
                  disabled={approveMutation.isPending}
                  onClick={() =>
                    approveMutation.mutate(selectedSponsorship._id)
                  }
                >
                  <CheckCircle className="h-4 w-4" />
                  {approveMutation.isPending ? "Approving..." : "Approve"}
                </Button>
                <Button
                  className="w-full gap-2"
                  disabled={rejectMutation.isPending}
                  onClick={() => setRejectDialog(selectedSponsorship._id)}
                  variant="destructive"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </Button>
                <Button
                  className="w-full gap-2"
                  disabled={generateReEditLinkMutation.isPending}
                  onClick={() =>
                    generateReEditLinkMutation.mutate(selectedSponsorship._id)
                  }
                  variant="outline"
                >
                  <Link className="h-4 w-4" />
                  {generateReEditLinkMutation.isPending
                    ? "Generating..."
                    : "Let Sponsor Re-edit"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="sticky top-24 flex h-64 flex-col items-center justify-center rounded-2xl border border-[var(--admin-border)] border-dashed text-center">
              <Clock className="mb-3 h-10 w-10 text-[var(--admin-text-muted)]" />
              <p className="font-medium text-[var(--admin-text)]">
                Select a sponsorship
              </p>
              <p className="text-[var(--admin-text-muted)] text-sm">
                Click on any item to review
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog onOpenChange={() => setRejectDialog(null)} open={!!rejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[var(--admin-error)]" />
              Reject Sponsorship
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this sponsorship. The
              sponsor will be notified.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            className="min-h-[120px]"
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Enter rejection reason..."
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
              {rejectMutation.isPending ? "Rejecting..." : "Reject Sponsorship"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
