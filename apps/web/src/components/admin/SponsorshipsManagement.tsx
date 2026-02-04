import MuxPlayer from "@mux/mux-player-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Euro,
  Eye,
  Filter,
  Mail,
  Search,
  Timer,
  User,
  Users,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { client, orpc } from "@/utils/orpc";

interface Sponsorship {
  _id: string;
  gestureId: string;
  gestureName?: string;
  sponsorName: string;
  sponsorEmail: string;
  overlayImageStorageId?: string;
  overlayText: string;
  sponsoredVideoPlaybackId?: string;
  originalVideoPlaybackId?: string;
  startDate: number;
  endDate: number;
  durationYears: number;
  status: string;
  molliePaymentId?: string;
  paymentAmount: number;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: number;
  createdAt: number;
  updatedAt: number;
}

const statusConfig: Record<
  string,
  {
    label: string;
    color: string;
    bgColor: string;
    icon: React.ElementType;
  }
> = {
  pending: {
    label: "Pending",
    color: "text-amber-600",
    bgColor: "bg-amber-500/10",
    icon: Clock,
  },
  pending_payment: {
    label: "Awaiting Payment",
    color: "text-blue-600",
    bgColor: "bg-blue-500/10",
    icon: Euro,
  },
  pending_approval: {
    label: "Pending Approval",
    color: "text-amber-600",
    bgColor: "bg-amber-500/10",
    icon: Clock,
  },
  active: {
    label: "Active",
    color: "text-emerald-600",
    bgColor: "bg-emerald-500/10",
    icon: CheckCircle,
  },
  expired: {
    label: "Expired",
    color: "text-gray-500",
    bgColor: "bg-gray-500/10",
    icon: Timer,
  },
  rejected: {
    label: "Rejected",
    color: "text-red-600",
    bgColor: "bg-red-500/10",
    icon: XCircle,
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-xs ${config.bgColor} ${config.color}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function SponsorshipCard({
  sponsorship,
  isSelected,
  onClick,
}: {
  sponsorship: Sponsorship;
  isSelected: boolean;
  onClick: () => void;
}) {
  const config = statusConfig[sponsorship.status] || statusConfig.pending;

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
        {/* Status badge */}
        <div
          className={`absolute top-2 left-2 flex items-center gap-1 rounded-full px-2 py-1 text-xs backdrop-blur-sm ${config.bgColor} ${config.color}`}
        >
          <config.icon className="h-3 w-3" />
          {config.label}
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

        {/* Info */}
        <div className="flex flex-wrap gap-1.5">
          <span className="flex items-center gap-1 rounded-md bg-[var(--admin-bg)] px-2 py-0.5 text-[var(--admin-text-secondary)] text-xs">
            <Euro className="h-3 w-3" />
            {(sponsorship.paymentAmount / 100).toFixed(0)}
          </span>
          <span className="flex items-center gap-1 rounded-md bg-[var(--admin-bg)] px-2 py-0.5 text-[var(--admin-text-secondary)] text-xs">
            <Calendar className="h-3 w-3" />
            {sponsorship.durationYears}y
          </span>
        </div>
      </div>
    </button>
  );
}

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
    <div className="sticky top-24 space-y-4 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-bg)] p-4">
      {/* Video Preview */}
      <div className="overflow-hidden rounded-xl">
        <MuxPlayer
          loop
          muted
          playbackId={
            sponsorship.sponsoredVideoPlaybackId ||
            sponsorship.originalVideoPlaybackId
          }
          streamType="on-demand"
          style={{ width: "100%", aspectRatio: "16/9" }}
        />
      </div>

      {/* Details */}
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-[var(--admin-text)] text-lg">
            {sponsorship.gestureName || "Unknown Gesture"}
          </h3>
          <div className="mt-2">
            <StatusBadge status={sponsorship.status} />
          </div>
        </div>

        {/* Sponsor Info */}
        <div className="space-y-2 rounded-lg bg-[var(--admin-card)] p-3">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-[var(--admin-text-muted)]" />
            <span className="text-[var(--admin-text)]">
              {sponsorship.sponsorName}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-[var(--admin-text-muted)]" />
            <span className="text-[var(--admin-text-secondary)]">
              {sponsorship.sponsorEmail}
            </span>
          </div>
        </div>

        {/* Payment & Duration */}
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg bg-[var(--admin-card)] p-3">
            <p className="mb-1 text-[var(--admin-text-muted)] text-xs">
              Amount
            </p>
            <p className="font-semibold text-[var(--admin-text)]">
              €{(sponsorship.paymentAmount / 100).toFixed(2)}
            </p>
          </div>
          <div className="flex-1 rounded-lg bg-[var(--admin-card)] p-3">
            <p className="mb-1 text-[var(--admin-text-muted)] text-xs">
              Duration
            </p>
            <p className="font-semibold text-[var(--admin-text)]">
              {sponsorship.durationYears} year
              {sponsorship.durationYears !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Expiration for active */}
        {sponsorship.status === "active" && (
          <div className="rounded-lg bg-[var(--admin-card)] p-3">
            <p className="mb-1 text-[var(--admin-text-muted)] text-xs">
              Expires
            </p>
            <p className="font-medium text-[var(--admin-text)]">
              {new Date(sponsorship.endDate).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        )}

        {/* Rejection Reason */}
        {sponsorship.rejectionReason && (
          <div className="rounded-lg bg-red-50 p-3 dark:bg-red-950/30">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div>
                <p className="mb-1 font-medium text-red-600 text-xs dark:text-red-400">
                  Rejection Reason
                </p>
                <p className="text-red-600 text-sm dark:text-red-400">
                  {sponsorship.rejectionReason}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="space-y-1 text-[var(--admin-text-muted)] text-xs">
          <p>Created: {new Date(sponsorship.createdAt).toLocaleDateString()}</p>
          <p>Updated: {new Date(sponsorship.updatedAt).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 border-[var(--admin-border)] border-t pt-4">
        <Button
          className="w-full gap-2"
          onClick={onViewDetails}
          variant="outline"
        >
          <Eye className="h-4 w-4" />
          View Full Details
        </Button>

        {sponsorship.status === "active" && (
          <Button
            className="w-full gap-2"
            disabled={isExpiring}
            onClick={onForceExpire}
            variant="destructive"
          >
            <Timer className="h-4 w-4" />
            {isExpiring ? "Expiring..." : "Force Expire"}
          </Button>
        )}
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
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--admin-accent)]" />
            Sponsorship Details
          </DialogTitle>
          <DialogDescription>
            {sponsorship.gestureName || "Unknown Gesture"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Videos */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-[var(--admin-text)] text-sm">
                Original Video
              </h4>
              <div className="overflow-hidden rounded-xl bg-[var(--admin-bg)]">
                <MuxPlayer
                  loop
                  muted
                  playbackId={sponsorship.originalVideoPlaybackId}
                  streamType="on-demand"
                  style={{ width: "100%", aspectRatio: "16/9" }}
                />
              </div>
              <code className="block truncate rounded-lg bg-[var(--admin-bg)] px-3 py-2 font-mono text-[var(--admin-text-muted)] text-xs">
                {sponsorship.originalVideoPlaybackId}
              </code>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-[var(--admin-text)] text-sm">
                Sponsored Video
              </h4>
              {sponsorship.sponsoredVideoPlaybackId ? (
                <>
                  <div className="overflow-hidden rounded-xl bg-[var(--admin-bg)]">
                    <MuxPlayer
                      loop
                      muted
                      playbackId={sponsorship.sponsoredVideoPlaybackId}
                      streamType="on-demand"
                      style={{ width: "100%", aspectRatio: "16/9" }}
                    />
                  </div>
                  <code className="block truncate rounded-lg bg-[var(--admin-bg)] px-3 py-2 font-mono text-[var(--admin-text-muted)] text-xs">
                    {sponsorship.sponsoredVideoPlaybackId}
                  </code>
                </>
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-xl bg-[var(--admin-bg)] text-[var(--admin-text-muted)] text-sm">
                  No sponsored video
                </div>
              )}
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-6 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-bg)] p-6">
            <div className="space-y-4">
              <div>
                <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                  Sponsor
                </p>
                <p className="text-[var(--admin-text)]">
                  {sponsorship.sponsorName}
                </p>
                <p className="text-[var(--admin-text-secondary)] text-sm">
                  {sponsorship.sponsorEmail}
                </p>
              </div>

              <div>
                <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                  Status
                </p>
                <StatusBadge status={sponsorship.status} />
              </div>

              <div>
                <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                  Overlay Text
                </p>
                <p className="text-[var(--admin-text)] italic">
                  "{sponsorship.overlayText}"
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                    Amount
                  </p>
                  <p className="font-semibold text-[var(--admin-text)] text-lg">
                    €{(sponsorship.paymentAmount / 100).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                    Duration
                  </p>
                  <p className="font-semibold text-[var(--admin-text)] text-lg">
                    {sponsorship.durationYears} year
                    {sponsorship.durationYears !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              {sponsorship.molliePaymentId && (
                <div>
                  <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                    Payment ID
                  </p>
                  <code className="block truncate rounded-lg bg-[var(--admin-card)] px-3 py-2 font-mono text-[var(--admin-text-secondary)] text-xs">
                    {sponsorship.molliePaymentId}
                  </code>
                </div>
              )}

              {sponsorship.status === "active" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                      Start Date
                    </p>
                    <p className="text-[var(--admin-text)]">
                      {new Date(sponsorship.startDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                      End Date
                    </p>
                    <p className="text-[var(--admin-text)]">
                      {new Date(sponsorship.endDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              {sponsorship.rejectionReason && (
                <div className="rounded-lg bg-red-50 p-3 dark:bg-red-950/30">
                  <p className="mb-1 font-medium text-red-600 text-xs dark:text-red-400">
                    Rejection Reason
                  </p>
                  <p className="text-red-600 text-sm dark:text-red-400">
                    {sponsorship.rejectionReason}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Timestamps */}
          <div className="flex justify-between text-[var(--admin-text-muted)] text-xs">
            <span>
              Created: {new Date(sponsorship.createdAt).toLocaleString()}
            </span>
            <span>
              Updated: {new Date(sponsorship.updatedAt).toLocaleString()}
            </span>
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
  const [confirmExpireDialog, setConfirmExpireDialog] = useState<string | null>(
    null
  );
  const queryClient = useQueryClient();

  const { data: sponsorships, isLoading } = useQuery({
    ...orpc.admin.sponsorships.listAll.queryOptions({
      status: statusFilter === "all" ? undefined : statusFilter,
      limit: 100,
    }),
    refetchOnMount: true,
  });

  const forceExpireMutation = useMutation({
    mutationFn: (sponsorshipId: string) =>
      client.admin.sponsorships.forceExpire({ sponsorshipId }),
    onSuccess: () => {
      toast.success("Sponsorship expired successfully");
      queryClient.invalidateQueries({
        queryKey: ["admin", "sponsorships"],
      });
      setSelectedSponsorshipId(null);
      setDetailsDialog(null);
      setConfirmExpireDialog(null);
    },
    onError: (error) => {
      toast.error(`Failed to expire sponsorship: ${error.message}`);
    },
  });

  // Filter by search query
  const filteredSponsorships = useMemo(() => {
    if (!sponsorships) {
      return [];
    }
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
  }, [sponsorships, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    if (!sponsorships) {
      return { total: 0, active: 0, pending: 0 };
    }
    return {
      total: sponsorships.length,
      active: sponsorships.filter((s) => s.status === "active").length,
      pending: sponsorships.filter(
        (s) => s.status === "pending_approval" || s.status === "pending_payment"
      ).length,
    };
  }, [sponsorships]);

  const selectedSponsorship = sponsorships?.find(
    (s) => s._id === selectedSponsorshipId
  );

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--admin-accent)] border-t-transparent" />
          <p className="text-[var(--admin-text-muted)] text-sm">
            Loading sponsorships...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--admin-accent)]/10">
              <Users className="h-5 w-5 text-[var(--admin-accent)]" />
            </div>
            <div>
              <p className="font-semibold text-[var(--admin-text)] text-lg">
                {stats.total}
              </p>
              <p className="text-[var(--admin-text-muted)] text-xs">
                Total Sponsorships
              </p>
            </div>
          </div>
          <div className="h-8 w-px bg-[var(--admin-border)]" />
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-[var(--admin-text-secondary)]">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              {stats.active} Active
            </span>
            <span className="flex items-center gap-1.5 text-[var(--admin-text-secondary)]">
              <Clock className="h-4 w-4 text-amber-500" />
              {stats.pending} Pending
            </span>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--admin-text-muted)]" />
          <Input
            className="h-11 bg-[var(--admin-bg)] pl-10"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by gesture, sponsor name, or email..."
            value={searchQuery}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[var(--admin-text-muted)]" />
          <Select onValueChange={setStatusFilter} value={statusFilter}>
            <SelectTrigger className="h-11 w-[180px] bg-[var(--admin-bg)]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="pending_payment">Awaiting Payment</SelectItem>
              <SelectItem value="pending_approval">Pending Approval</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex gap-6">
        {/* Sponsorship Grid */}
        <div className="min-w-0 flex-1">
          {filteredSponsorships.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-[var(--admin-border)] border-dashed text-center">
              <Users className="mb-3 h-10 w-10 text-[var(--admin-text-muted)]" />
              <p className="font-medium text-[var(--admin-text)]">
                No sponsorships found
              </p>
              <p className="text-[var(--admin-text-muted)] text-sm">
                Try adjusting your filters
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
            <SponsorshipDetailsPanel
              isExpiring={forceExpireMutation.isPending}
              onForceExpire={() =>
                setConfirmExpireDialog(selectedSponsorship._id)
              }
              onViewDetails={() => setDetailsDialog(selectedSponsorship)}
              sponsorship={selectedSponsorship}
            />
          ) : (
            <div className="sticky top-24 flex h-64 flex-col items-center justify-center rounded-2xl border border-[var(--admin-border)] border-dashed text-center">
              <Users className="mb-3 h-10 w-10 text-[var(--admin-text-muted)]" />
              <p className="font-medium text-[var(--admin-text)]">
                Select a sponsorship
              </p>
              <p className="text-[var(--admin-text-muted)] text-sm">
                Click on any item to view details
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Full Details Dialog */}
      <SponsorshipDetailsDialog
        onClose={() => setDetailsDialog(null)}
        sponsorship={detailsDialog}
      />

      {/* Confirm Expire Dialog */}
      <Dialog
        onOpenChange={() => setConfirmExpireDialog(null)}
        open={!!confirmExpireDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Force Expire Sponsorship
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to expire this sponsorship? This will
              immediately restore the original video and mark the sponsorship as
              expired. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setConfirmExpireDialog(null)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={forceExpireMutation.isPending}
              onClick={() => {
                if (confirmExpireDialog) {
                  forceExpireMutation.mutate(confirmExpireDialog);
                }
              }}
              variant="destructive"
            >
              {forceExpireMutation.isPending
                ? "Expiring..."
                : "Force Expire Sponsorship"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
