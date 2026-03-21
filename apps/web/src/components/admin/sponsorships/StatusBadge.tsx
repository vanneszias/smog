/**
 * @fileoverview Status badge for sponsorship status display.
 */

import { statusConfig } from "./statusConfig";

/** Compact coloured badge showing the current sponsorship status. */
export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? statusConfig.pending;
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
