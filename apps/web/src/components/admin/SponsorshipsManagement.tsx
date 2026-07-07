/**
 * @fileoverview Admin sponsorships management panel.
 *
 * Owns only state and layout — all sub-concerns are in child modules:
 * - `sponsorships/types.ts`                    — Sponsorship + StatusDisplayConfig types
 * - `sponsorships/statusConfig.ts`             — Status → colour/icon/label mapping
 * - `sponsorships/StatusBadge.tsx`             — Coloured status pill
 * - `sponsorships/SponsorshipCard.tsx`         — Thumbnail card for the grid
 * - `sponsorships/SponsorshipDetailsPanel.tsx` — Sticky detail sidebar
 * - `sponsorships/SponsorshipDetailsDialog.tsx`— Full-detail modal
 * - `sponsorships/ReEditLinkBox.tsx`           — Re-edit link display + copy
 * - `sponsorships/useSponsorshipMutations.ts`  — All admin mutation hooks
 */

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  CheckCircle,
  Clock,
  Download,
  Filter,
  Search,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { orpc } from "@/utils/orpc";
import { SponsorshipCard } from "./sponsorships/SponsorshipCard";
import { SponsorshipDetailsDialog } from "./sponsorships/SponsorshipDetailsDialog";
import { SponsorshipDetailsPanel } from "./sponsorships/SponsorshipDetailsPanel";
import type { Sponsorship } from "./sponsorships/types";
import { useSponsorshipMutations } from "./sponsorships/useSponsorshipMutations";

/**
 * Admin sponsorships management panel.
 *
 * Master-detail layout: filter/grid on the left, sticky detail panel on the right.
 * All mutations are delegated to `useSponsorshipMutations`.
 */
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
  const [confirmMarkPaidDialog, setConfirmMarkPaidDialog] = useState<
    string | null
  >(null);

  const { data: sponsorships, isLoading } = useQuery({
    ...orpc.admin.sponsorships.listAll.queryOptions({
      input: {
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 100,
      },
    }),
    refetchOnMount: true,
  });

  const {
    forceExpire,
    generateReEditLink,
    markPaidManually,
    cancelPendingPayment,
    exportCsv,
  } = useSponsorshipMutations({
    statusFilter,
    onExpireSuccess: () => {
      setSelectedSponsorshipId(null);
      setDetailsDialog(null);
      setConfirmExpireDialog(null);
    },
    onMarkPaidSuccess: () => {
      setSelectedSponsorshipId(null);
      setConfirmMarkPaidDialog(null);
    },
    onCancelSuccess: () => {
      setSelectedSponsorshipId(null);
    },
  });

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
      {/* Header + stats */}
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

      {/* Search & filters */}
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
              <SelectItem value="pending_resubmission">
                Awaiting Re-edit
              </SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          className="h-11"
          disabled={exportCsv.isPending}
          onClick={() => exportCsv.mutate()}
          variant="outline"
        >
          <Download className="mr-2 h-4 w-4" />
          {exportCsv.isPending ? "Exporting..." : "Export CSV"}
        </Button>
      </div>

      {/* Master-detail layout */}
      <div className="flex gap-6">
        {/* Card grid */}
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

        {/* Detail panel */}
        <div className="w-96 shrink-0">
          {selectedSponsorship ? (
            <SponsorshipDetailsPanel
              isCancelling={cancelPendingPayment.isPending}
              isExpiring={forceExpire.isPending}
              isGeneratingReEditLink={generateReEditLink.isPending}
              isMarkingPaid={markPaidManually.isPending}
              onCancelPendingPayment={() =>
                cancelPendingPayment.mutate(selectedSponsorship._id)
              }
              onForceExpire={() =>
                setConfirmExpireDialog(selectedSponsorship._id)
              }
              onGenerateReEditLink={() =>
                generateReEditLink.mutate(selectedSponsorship._id)
              }
              onMarkPaidManually={() =>
                setConfirmMarkPaidDialog(selectedSponsorship._id)
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

      {/* Modals */}
      <SponsorshipDetailsDialog
        onClose={() => setDetailsDialog(null)}
        sponsorship={detailsDialog}
      />

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
              disabled={forceExpire.isPending}
              onClick={() => {
                if (confirmExpireDialog) {
                  forceExpire.mutate(confirmExpireDialog);
                }
              }}
              variant="destructive"
            >
              {forceExpire.isPending
                ? "Expiring..."
                : "Force Expire Sponsorship"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={() => setConfirmMarkPaidDialog(null)}
        open={!!confirmMarkPaidDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-blue-500" />
              Mark as Paid Manually
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to mark this sponsorship as manually paid?
              This will move it to "Pending Approval" for review. Only do this
              if you have confirmed payment was received outside the automated
              system (e.g. bank transfer).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setConfirmMarkPaidDialog(null)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              disabled={markPaidManually.isPending}
              onClick={() => {
                if (confirmMarkPaidDialog) {
                  markPaidManually.mutate(confirmMarkPaidDialog);
                }
              }}
            >
              {markPaidManually.isPending
                ? "Marking as Paid..."
                : "Yes, Mark as Paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
