import {
  type Account,
  exportFileName,
  serializeExport,
  useDeleteAccountForm,
  useExport,
} from "@smog/account/client";
import { DELETE_CONFIRMATION } from "@smog/account/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  AlertDialog,
  Button,
  Field,
  Input,
  Text,
  TextLink,
  useToast,
} from "@smog/ui-web";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Download, Trash2 } from "lucide-react";
import { type ChangeEvent, type ReactNode, useCallback } from "react";
import { AnalyticsSwitch } from "@/components/consent-banner";
import { useAuthClient } from "@/lib/auth-client";
import { AccountRow, AccountSection } from "./section";
import { useSignInAgain } from "./use-action-toast";

/**
 * Saves `text` as a file through a temporary object URL. The anchor is in
 * the document while clicked and the URL outlives the click (older Safari
 * and Firefox drop the download otherwise).
 */
function download(text: string, fileName: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function ExportRow(): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { exportAccount, status } = useExport();
  const save = useCallback(async () => {
    try {
      download(serializeExport(await exportAccount()), exportFileName());
      toast({ title: t("account.privacy.exported"), variant: "success" });
    } catch {
      // `useExport` logged it.
      toast({ title: t("account.privacy.exportFailed"), variant: "danger" });
    }
  }, [exportAccount, t, toast]);
  return (
    <AccountRow
      action={
        <Button
          icon={<Download />}
          loading={status === "exporting"}
          onClick={save}
          variant="secondary"
        >
          {t("account.privacy.export")}
        </Button>
      }
      description={t("account.privacy.exportDescription")}
      title={t("account.privacy.export")}
    >
      <Text className="mt-1" size="body-sm" tone="warning">
        {t("account.export.sensitive")}
      </Text>
    </AccountRow>
  );
}

/**
 * Privacy: the analytics decision, the policy and (signed in) the export.
 * Guests get the switch only: their data never leaves the device.
 */
export function PrivacySection({ signedIn }: { signedIn: boolean }): ReactNode {
  const { t } = useTranslation();
  return (
    <AccountSection title={t("account.privacy.title")}>
      <div className="flex flex-col gap-2">
        <AnalyticsSwitch />
        <TextLink className="self-start text-body-sm" href="/privacy">
          {t("account.privacy.policy")}
        </TextLink>
      </div>
      {signedIn ? (
        <div className="flex flex-col gap-4 border-border-subtle border-t pt-4">
          <ExportRow />
        </div>
      ) : null}
    </AccountSection>
  );
}

/**
 * Deletion (spec §5.3): an AlertDialog where the user types DELETE (and
 * the password, when the account has one), from `useDeleteAccountForm`.
 * A session that is too old without a password needs a fresh sign-in,
 * which the dialog offers.
 */
export function DeleteAccountSection({
  account,
}: {
  account: Account;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const client = useAuthClient();
  const navigate = useNavigate();
  const router = useRouter();
  const signInAgain = useSignInAgain();
  const signOut = useCallback(() => client.signOut(), [client]);
  const form = useDeleteAccountForm({
    needsPassword: account.me?.methods.password ?? false,
    signOut,
  });
  const { confirm, setPassword, setTyped } = form;

  const onTyped = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setTyped(event.target.value),
    [setTyped]
  );
  const onPassword = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value),
    [setPassword]
  );
  // Leave only once deleted: by then the session reads signed out, so the
  // next page's user queries stay off (no request for the deleted user).
  const onConfirm = useCallback(async () => {
    if (await confirm()) {
      toast({ title: t("account.delete.deleted"), variant: "success" });
      await router.invalidate();
      await navigate({ replace: true, to: "/" });
    }
  }, [confirm, navigate, router, t, toast]);

  return (
    <AccountSection
      description={t("account.delete.description")}
      title={t("account.delete.title")}
      tone="danger"
    >
      <div>
        <AlertDialog
          body={
            <>
              <Field
                label={t("account.delete.confirmLabel", {
                  word: DELETE_CONFIRMATION,
                })}
              >
                <Input
                  autoCapitalize="characters"
                  autoComplete="off"
                  onChange={onTyped}
                  spellCheck={false}
                  value={form.typed}
                />
              </Field>
              {account.me?.methods.password ? (
                <Field label={t("account.delete.password")}>
                  <Input
                    autoComplete="current-password"
                    onChange={onPassword}
                    type="password"
                    value={form.password}
                  />
                </Field>
              ) : null}
              {form.failureMessage ? (
                <div className="flex flex-col items-start gap-2" role="alert">
                  <Text size="body-sm" tone="danger">
                    {form.failureMessage}
                  </Text>
                  {form.failure === "SESSION_NOT_FRESH" ? (
                    <Button onClick={signInAgain} size="sm" variant="secondary">
                      {t("account.delete.signInAgain")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          }
          confirmDisabled={!form.ready}
          confirmLabel={t("account.delete.action")}
          description={t("account.delete.dialogDescription")}
          loading={form.deleting}
          onConfirm={onConfirm}
          onOpenChange={form.onOpenChange}
          open={form.open}
          title={t("account.delete.dialogTitle")}
          tone="danger"
        >
          <Button icon={<Trash2 />} variant="danger">
            {t("account.delete.action")}
          </Button>
        </AlertDialog>
      </div>
    </AccountSection>
  );
}
