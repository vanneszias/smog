/**
 * @fileoverview Status display configuration for sponsorship status badges.
 */

import {
  Ban,
  CheckCircle,
  Clock,
  Euro,
  RefreshCcw,
  Timer,
  XCircle,
} from "lucide-react";
import type { StatusDisplayConfig } from "./types";

/**
 * Display configuration keyed by sponsorship status value.
 * Used by `StatusBadge` and `SponsorshipCard`.
 */
export const statusConfig: Record<string, StatusDisplayConfig> = {
  active: {
    bgColor: "bg-emerald-500/10",
    color: "text-emerald-600",
    icon: CheckCircle,
    label: "Active",
  },
  cancelled: {
    bgColor: "bg-gray-500/10",
    color: "text-gray-500",
    icon: Ban,
    label: "Cancelled",
  },
  expired: {
    bgColor: "bg-gray-500/10",
    color: "text-gray-500",
    icon: Timer,
    label: "Expired",
  },
  pending: {
    bgColor: "bg-amber-500/10",
    color: "text-amber-600",
    icon: Clock,
    label: "Pending",
  },
  pending_approval: {
    bgColor: "bg-amber-500/10",
    color: "text-amber-600",
    icon: Clock,
    label: "Pending Approval",
  },
  pending_payment: {
    bgColor: "bg-blue-500/10",
    color: "text-blue-600",
    icon: Euro,
    label: "Awaiting Payment",
  },
  pending_resubmission: {
    bgColor: "bg-purple-500/10",
    color: "text-purple-600",
    icon: RefreshCcw,
    label: "Awaiting Re-edit",
  },
  rejected: {
    bgColor: "bg-red-500/10",
    color: "text-red-600",
    icon: XCircle,
    label: "Rejected",
  },
};
