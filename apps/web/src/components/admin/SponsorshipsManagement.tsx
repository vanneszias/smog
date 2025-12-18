import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { orpc } from "@/utils/orpc";

export function SponsorshipsManagement() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: sponsorships, isLoading } = useQuery(
    orpc.admin.sponsorships.listAll.queryOptions({
      status: statusFilter === "all" ? undefined : statusFilter,
      limit: 100,
    })
  );

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      pending: "secondary",
      pending_payment: "outline",
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
                <Button size="sm" variant="outline">
                  View Details
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
