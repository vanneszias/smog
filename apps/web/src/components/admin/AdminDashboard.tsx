import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GesturesManagement } from "./GesturesManagement";
import { PendingSponsorships } from "./PendingSponsorships";
import { SponsorshipsManagement } from "./SponsorshipsManagement";

export interface AdminDashboardProps {
  user: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

export function AdminDashboard({ user }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState("pending");

  return (
    <div className="container mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <h1 className="mb-2 font-bold text-3xl">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user.firstName || user.email}
        </p>
      </div>

      <Tabs
        className="space-y-6"
        onValueChange={setActiveTab}
        value={activeTab}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending">Pending Approvals</TabsTrigger>
          <TabsTrigger value="sponsorships">All Sponsorships</TabsTrigger>
          <TabsTrigger value="gestures">Gestures</TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-4" value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Pending Sponsorship Approvals</CardTitle>
              <CardDescription>
                Review and approve or reject sponsorship requests that have been
                paid
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PendingSponsorships />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="space-y-4" value="sponsorships">
          <Card>
            <CardHeader>
              <CardTitle>All Sponsorships</CardTitle>
              <CardDescription>
                View and manage all sponsorships across all statuses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SponsorshipsManagement />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="space-y-4" value="gestures">
          <Card>
            <CardHeader>
              <CardTitle>Gesture Management</CardTitle>
              <CardDescription>
                Edit gesture details, Mux playback IDs, and manage visibility
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GesturesManagement />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
