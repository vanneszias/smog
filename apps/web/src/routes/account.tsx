import { api } from "@smog/convex";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Download, Loader2, Settings, Trash2, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import { client } from "@/lib/client";

export const Route = createFileRoute("/account")({
  component: AccountComponent,
});

function AccountComponent() {
  const { user, isAuthenticated, signOut } = useAuth();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get consent status from Convex
  const consentStatus = useQuery(api.gdpr.getConsentStatus);
  const updateConsent = useMutation(api.gdpr.updateConsent);
  const deleteUserAccount = useMutation(api.gdpr.deleteUserAccount);

  // Show sign in message if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="container mx-auto flex min-h-full flex-col items-center justify-center px-4 py-12">
        <User className="mb-4 h-16 w-16 text-muted-foreground" />
        <h2 className="mb-2 font-bold text-2xl">Sign In Required</h2>
        <p className="mb-4 text-center text-muted-foreground">
          Please sign in to manage your account settings
        </p>
      </div>
    );
  }

  const handleAnalyticsToggle = async (checked: boolean) => {
    try {
      await updateConsent({
        analyticsConsent: checked,
        marketingConsent: consentStatus?.marketingConsent ?? false,
      });

      // Update local storage to match
      localStorage.setItem("smog_analytics_consent", checked.toString());

      toast.success(
        checked
          ? "Analytics enabled. Thank you for helping us improve!"
          : "Analytics disabled. Your data will no longer be collected."
      );
    } catch (error) {
      console.error("Failed to update consent:", error);
      toast.error("Failed to update analytics preference. Please try again.");
    }
  };

  const handleExportData = async () => {
    try {
      // Call the Convex query to export data
      const data = await client.query(api.gdpr.exportUserData);

      // Create a blob and download it
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `smog-user-data-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Your data has been downloaded successfully");
    } catch (error) {
      console.error("Failed to export data:", error);
      toast.error("Failed to export data. Please try again.");
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await deleteUserAccount({ confirmDelete: true });

      // Clear local storage
      localStorage.clear();

      toast.success("Your account has been permanently deleted");

      // Sign out and redirect
      signOut();
    } catch (error) {
      console.error("Failed to delete account:", error);
      toast.error("Failed to delete account. Please try again.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Settings className="h-8 w-8" />
        <h1 className="font-bold text-3xl">Account Settings</h1>
      </div>

      {/* Account Information */}
      <Card className="mb-6 p-6">
        <h2 className="mb-4 font-semibold text-xl">Account Information</h2>
        <div className="space-y-3">
          <div>
            <Label className="text-muted-foreground text-sm">Email</Label>
            <p className="font-medium">{user?.email ?? ""}</p>
          </div>
          {user?.firstName ? (
            <div>
              <Label className="text-muted-foreground text-sm">Name</Label>
              <p className="font-medium">
                {user.firstName} {user.lastName ?? ""}
              </p>
            </div>
          ) : null}
          <div>
            <Label className="text-muted-foreground text-sm">User ID</Label>
            <p className="font-mono text-muted-foreground text-xs">
              {user?.id ?? ""}
            </p>
          </div>
        </div>
      </Card>

      {/* Privacy & Data */}
      <Card className="mb-6 p-6">
        <h2 className="mb-4 font-semibold text-xl">Privacy & Data</h2>

        {/* Analytics Consent */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex-1">
            <Label className="font-medium text-base">Usage Analytics</Label>
            <p className="mt-1 text-muted-foreground text-sm">
              Help us improve SMOG by sharing anonymous usage data. This does
              not include any personal information.
            </p>
          </div>
          <Switch
            checked={consentStatus?.analyticsConsent ?? false}
            disabled={!consentStatus}
            onCheckedChange={handleAnalyticsToggle}
          />
        </div>

        {/* Data Export */}
        <div className="mb-6">
          <Label className="mb-2 block font-medium text-base">
            Download Your Data
          </Label>
          <p className="mb-3 text-muted-foreground text-sm">
            Export all your account data including favorites, preferences, and
            consent history in JSON format.
          </p>
          <Button onClick={handleExportData} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download Data
          </Button>
        </div>

        {/* Privacy Links */}
        <div className="border-gray-200 border-t pt-4 dark:border-gray-700">
          <p className="mb-2 text-muted-foreground text-sm">
            Learn more about how we handle your data:
          </p>
          <div className="flex gap-4">
            <Link
              className="text-primary text-sm underline hover:no-underline"
              to="/privacy"
            >
              Privacy Policy
            </Link>
            <Link
              className="text-primary text-sm underline hover:no-underline"
              to="/terms"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 p-6 dark:border-red-900">
        <h2 className="mb-4 font-semibold text-red-600 text-xl dark:text-red-400">
          Danger Zone
        </h2>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <Label className="font-medium text-base">Delete Account</Label>
            <p className="mt-1 text-muted-foreground text-sm">
              Permanently delete your account and all associated data. This
              action cannot be undone.
            </p>
          </div>
          <Button
            onClick={() => setShowDeleteDialog(true)}
            variant="destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Account
          </Button>
        </div>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your
              account and remove all your data from our servers, including:
              <ul className="mt-2 ml-4 list-disc space-y-1">
                <li>Your account information</li>
                <li>All saved favorites</li>
                <li>Your consent history</li>
                <li>Any admin activity logs</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={isDeleting}
              onClick={() => setShowDeleteDialog(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isDeleting}
              onClick={handleDeleteAccount}
              variant="destructive"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete My Account"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
