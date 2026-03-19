/**
 * @fileoverview Re-edit link display box for sponsorship detail panel.
 * Shows the active re-edit link (if any) with a copy button.
 */

import { useQuery } from "@tanstack/react-query";
import { Copy, Link, RefreshCcw } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { client } from "@/utils/orpc";

interface ReEditLinkBoxProps {
  sponsorshipId: string;
}

/** Displays and provides a copy button for the active re-edit link. */
export function ReEditLinkBox({ sponsorshipId }: ReEditLinkBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: linkData, isLoading } = useQuery({
    queryKey: ["admin", "sponsorships", "reEditLink", sponsorshipId],
    queryFn: () => client.admin.sponsorships.getReEditLink({ sponsorshipId }),
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-purple-50 px-3 py-2.5 text-purple-600 text-xs dark:bg-purple-950/30">
        <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
        Loading re-edit link…
      </div>
    );
  }

  if (!linkData || linkData.expired) {
    return (
      <div className="rounded-lg bg-[var(--admin-card)] px-3 py-2.5 text-[var(--admin-text-muted)] text-xs">
        {linkData?.expired
          ? "Re-edit link expired. Generate a new one below."
          : "No active re-edit link."}
      </div>
    );
  }

  const daysLeft = Math.max(
    0,
    Math.ceil((linkData.expiresAt - Date.now()) / (1000 * 60 * 60 * 24))
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(linkData.url).catch(() => {
      inputRef.current?.select();
      document.execCommand("copy");
    });
    toast.success("Re-edit link copied!");
  };

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
        <Link className="h-3 w-3" />
        Active Re-edit Link
        <span className="ml-auto font-normal normal-case">
          {daysLeft}d left
        </span>
      </p>
      <div className="flex gap-1.5">
        <input
          className="min-w-0 flex-1 truncate rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-2.5 py-1.5 font-mono text-[var(--admin-text-secondary)] text-xs outline-none"
          readOnly
          ref={inputRef}
          value={linkData.url}
        />
        <Button
          className="shrink-0 gap-1.5 px-3"
          onClick={handleCopy}
          size="sm"
          variant="outline"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
    </div>
  );
}
