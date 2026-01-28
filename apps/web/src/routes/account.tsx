import { api } from "@smog/convex";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { Download, Loader2, Settings, Trash2, User } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { onConsentChange } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/account")({
  component: AccountPage,
});

function AccountPage() {
  return (
    <>
      <AuthLoading>
        <LoadingState />
      </AuthLoading>
      <Unauthenticated>
        <UnauthenticatedState />
      </Unauthenticated>
      <Authenticated>
        <AccountContent />
      </Authenticated>
    </>
  );
}

function LoadingState() {
  const { t } = useTranslation();

  return (
    <div className="container mx-auto flex min-h-full flex-col items-center justify-center px-4 py-12">
      <Loader2 className="mb-4 h-16 w-16 animate-spin text-muted-foreground" />
      <h2 className="mb-2 font-bold text-2xl">
        {t("web.account.loading.title")}
      </h2>
      <p className="text-center text-muted-foreground">
        {t("web.account.loading.message")}
      </p>
    </div>
  );
}

function UnauthenticatedState() {
  const { t } = useTranslation();
  const { signIn } = useAuth();

  return (
    <div className="container mx-auto flex min-h-full flex-col items-center justify-center px-4 py-12">
      <User className="mb-4 h-16 w-16 text-muted-foreground" />
      <h2 className="mb-2 font-bold text-2xl">
        {t("web.account.unauthenticated.title")}
      </h2>
      <p className="mb-4 text-center text-muted-foreground">
        {t("web.account.unauthenticated.message")}
      </p>
      <Button onClick={() => signIn()}>
        {t("web.account.unauthenticated.signInButton")}
      </Button>
    </div>
  );
}

/**
 * Account content component - only rendered when authenticated with Convex.
 * This ensures ctx.auth.getUserIdentity() will return a valid identity.
 */
function AccountContent() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Get consent status from Convex - this will work because we're inside <Authenticated>
  const consentStatus = useQuery(api.gdpr.getConsentStatus);
  const updateConsent = useMutation(api.gdpr.updateConsent);
  const deleteUserAccount = useMutation(api.gdpr.deleteUserAccount);
  const exportUserData = useQuery(api.gdpr.exportUserData);

  const handleAnalyticsToggle = async (checked: boolean) => {
    try {
      if (checked) {
        await updateAnalyticsConsent(true);
      } else {
        await updateAnalyticsConsent(false);
      }

      toast.success(
        checked
          ? t("web.account.toast.analyticsEnabled")
          : t("web.account.toast.analyticsDisabled")
      );
    } catch (error) {
      console.error("Failed to update consent:", error);
      toast.error(t("web.account.toast.analyticsUpdateFailed"));
    }
  };

  async function updateAnalyticsConsent(enabled: boolean) {
    await updateConsent({
      analyticsConsent: enabled,
      marketingConsent: consentStatus?.marketingConsent ?? false,
    });
    onConsentChange({
      hasConsent: true,
      analyticsConsent: enabled,
      marketingConsent: false,
    });
  }

  const handleExportData = async () => {
    if (!exportUserData) {
      toast.error(t("web.account.toast.exportUnavailable"));
      return;
    }

    setIsExporting(true);
    try {
      // Create a blob and download it
      const blob = new Blob([JSON.stringify(exportUserData, null, 2)], {
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

      toast.success(t("web.account.toast.exportSuccess"));
    } catch (error) {
      console.error("Failed to export data:", error);
      toast.error(t("web.account.toast.exportFailed"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await deleteUserAccount({ confirmDelete: true });

      // Clear local storage
      localStorage.clear();

      toast.success(t("web.account.toast.deleteSuccess"));

      // Sign out and redirect
      signOut();
    } catch (error) {
      console.error("Failed to delete account:", error);
      toast.error(t("web.account.toast.deleteFailed"));
      setIsDeleting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Settings className="h-8 w-8" />
        <h1 className="font-bold text-3xl">{t("web.account.title")}</h1>
      </div>
      {/* Account Information */}
      <Card className="mb-6 p-6">
        <h2 className="mb-4 font-semibold text-xl">
          {t("web.account.accountInfo.title")}
        </h2>
        <div className="space-y-3">
          <div>
            <Label className="text-muted-foreground text-sm">
              {t("web.account.accountInfo.email")}
            </Label>
            <p className="font-medium">{user?.email ?? ""}</p>
          </div>
          {user?.firstName ? (
            <div>
              <Label className="text-muted-foreground text-sm">
                {t("web.account.accountInfo.name")}
              </Label>
              <p className="font-medium">
                {user.firstName} {user.lastName ?? ""}
              </p>
            </div>
          ) : null}
          <div>
            <Label className="text-muted-foreground text-sm">
              {t("web.account.accountInfo.userId")}
            </Label>
            <p className="font-mono text-muted-foreground text-xs">
              {user?.id ?? ""}
            </p>
          </div>
        </div>
      </Card>
      <Card className="mb-6 p-6">
        (
        <h2 className="mb-4 font-semibold text-xl">
          {t("web.account.privacy.title")}
        </h2>
        );
        {/* Analytics Consent */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex-1">
            <Label className="font-medium text-base">
              {t("web.account.privacy.analytics.title")}
            </Label>
            <p className="mt-1 text-muted-foreground text-sm">
              {t("web.account.privacy.analytics.description")}
            </p>
          </div>
          <Switch
            checked={consentStatus?.analyticsConsent ?? false}
            disabled={!consentStatus}
            onCheckedChange={handleAnalyticsToggle}
          />
        </div>
        ;{/* Data Export */}
        <div className="mb-6">
          <Label className="mb-2 block font-medium text-base">
            {t("web.account.privacy.export.title")}
          </Label>
          <p className="mb-3 text-muted-foreground text-sm">
            {t("web.account.privacy.export.description")}
          </p>
          <Button
            disabled={!exportUserData || isExporting}
            onClick={handleExportData}
            variant="outline"
          >
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("web.account.privacy.export.exporting")}
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {t("web.account.privacy.export.button")}
              </>
            )}
          </Button>
        </div>
        ;{/* Privacy Links */}
        <div className="border-gray-200 border-t pt-4 dark:border-gray-700">
          <p className="mb-2 text-muted-foreground text-sm">
            {t("web.account.privacy.learnMore")}
          </p>
          <div className="flex gap-4">
            <Link
              className="text-primary text-sm underline hover:no-underline"
              to="/privacy"
            >
              {t("web.account.privacy.privacyPolicy")}
            </Link>
            <Link
              className="text-primary text-sm underline hover:no-underline"
              to="/terms"
            >
              {t("web.account.privacy.termsOfService")}
            </Link>
          </div>
        </div>
        ;
      </Card>
      <Card className="border-red-200 p-6 dark:border-red-900">
        <h2 className="mb-4 font-semibold text-red-600 text-xl dark:text-red-400">
          {t("web.account.dangerZone.title")}
        </h2>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <Label className="font-medium text-base">
              {t("web.account.dangerZone.deleteAccount.title")}
            </Label>
            <p className="mt-1 text-muted-foreground text-sm">
              {t("web.account.dangerZone.deleteAccount.description")}
            </p>
          </div>
          <Button
            onClick={() => setShowDeleteDialog(true)}
            variant="destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("web.account.dangerZone.deleteAccount.button")}
          </Button>
        </div>
      </Card>
      ;
      <Dialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("web.account.deleteDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("web.account.deleteDialog.description")}
              <ul className="mt-2 ml-4 list-disc space-y-1">
                <li>{t("web.account.deleteDialog.listItems.accountInfo")}</li>
                <li>{t("web.account.deleteDialog.listItems.favorites")}</li>
                <li>
                  {t("web.account.deleteDialog.listItems.consentHistory")}
                </li>
                <li>{t("web.account.deleteDialog.listItems.adminLogs")}</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={isDeleting}
              onClick={() => setShowDeleteDialog(false)}
              variant="outline"
            >
              {t("web.account.deleteDialog.cancel")}
            </Button>
            <Button
              disabled={isDeleting}
              onClick={handleDeleteAccount}
              variant="destructive"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("web.account.deleteDialog.deleting")}
                </>
              ) : (
                t("web.account.deleteDialog.confirm")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
