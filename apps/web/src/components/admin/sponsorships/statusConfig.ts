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
  pending_resubmission: {
    label: "Awaiting Re-edit",
    color: "text-purple-600",
    bgColor: "bg-purple-500/10",
    icon: RefreshCcw,
  },
  cancelled: {
    label: "Cancelled",
    color: "text-gray-500",
    bgColor: "bg-gray-500/10",
    icon: Ban,
  },
};
