/**
 * @fileoverview Mutations for the sponsorships admin module.
 *
 * Groups all admin sponsorship mutations (expire, re-edit, mark paid, export CSV)
 * so the main `SponsorshipsManagement` component only deals with UI concerns.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { client, orpc } from "@/utils/orpc";

interface UseSponsorshipMutationsOptions {
  onCancelSuccess: () => void;
  onExpireSuccess: () => void;
  onMarkPaidSuccess: () => void;
  statusFilter: string;
}

/**
 * Provides all admin sponsorship mutation hooks.
 *
 * @param options.statusFilter - Current status filter (used to invalidate the right query key)
 * @param options.onExpireSuccess - Called after a successful force-expire
 * @param options.onMarkPaidSuccess - Called after a successful mark-as-paid
 */
export function useSponsorshipMutations({
  statusFilter,
  onExpireSuccess,
  onMarkPaidSuccess,
  onCancelSuccess,
}: UseSponsorshipMutationsOptions) {
  const queryClient = useQueryClient();

  const invalidateSponsorships = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "sponsorships"] });
  };

  const forceExpire = useMutation({
    mutationFn: (sponsorshipId: string) =>
      client.admin.sponsorships.forceExpire({ sponsorshipId }),
    onError: (error) => {
      toast.error(`Failed to expire sponsorship: ${error.message}`);
    },
    onSuccess: () => {
      toast.success("Sponsorship expired successfully");
      invalidateSponsorships();
      onExpireSuccess();
    },
  });

  const generateReEditLink = useMutation({
    mutationFn: (sponsorshipId: string) =>
      client.admin.sponsorships.generateReEditLink({ sponsorshipId }),
    onError: (error) => {
      toast.error(`Failed to generate re-edit link: ${error.message}`);
    },
    onSuccess: (data) => {
      navigator.clipboard.writeText(data.url).catch(() => {
        toast.info("Re-edit link generated", { description: data.url });
      });
      toast.success("Re-edit link copied to clipboard!", {
        description: "Expires in 7 days",
      });
      invalidateSponsorships();
    },
  });

  const markPaidManually = useMutation({
    mutationFn: (sponsorshipId: string) =>
      client.admin.sponsorships.markPaidManually({ sponsorshipId }),
    onError: (error) => {
      toast.error(`Failed to mark as paid: ${error.message}`);
    },
    onSuccess: () => {
      toast.success("Sponsorship marked as paid — now pending approval");
      invalidateSponsorships();
      queryClient.invalidateQueries({
        queryKey:
          orpc.admin.sponsorships.listPendingApproval.queryOptions().queryKey,
      });
      onMarkPaidSuccess();
    },
  });

  const cancelPendingPayment = useMutation({
    mutationFn: (sponsorshipId: string) =>
      client.admin.sponsorships.cancelPendingPayment({ sponsorshipId }),
    onError: (error) => {
      toast.error(`Failed to cancel sponsorship: ${error.message}`);
    },
    onSuccess: () => {
      toast.success("Sponsorship cancelled — gesture is now available again");
      invalidateSponsorships();
      onCancelSuccess();
    },
  });

  const exportCsv = useMutation({
    mutationFn: () =>
      client.admin.sponsorships.exportToCsv({
        status: statusFilter as
          | "all"
          | "active"
          | "expired"
          | "pending"
          | "pending_payment"
          | "pending_approval"
          | "pending_resubmission"
          | "rejected",
      }),
    onError: (error: Error) => {
      toast.error(`Failed to export CSV: ${error.message}`);
    },
    onSuccess: (data: { csv: string }) => {
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sponsorships-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported successfully");
    },
  });

  return {
    cancelPendingPayment,
    exportCsv,
    forceExpire,
    generateReEditLink,
    markPaidManually,
  };
}
